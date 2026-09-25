-- HostReady initial schema. Paste into the Supabase SQL editor once (or `supabase db push`).
-- Knowledge tables: written only by scripts/ingest with the service role. RLS on with no policies = closed to the public API.
-- App tables: RLS per organisation. Server routes use the service role and filter by org explicitly (lib/api/server.ts).
create extension if not exists vector with schema extensions;

-- ---------- Knowledge ----------
create table councils (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug in ('ccc','waimakariri')),
  name text not null,
  timezone text not null default 'Pacific/Auckland'
);
create table kb_sources (
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references councils(id),
  url text not null,
  type text not null check (type in ('html','pdf','docx')),
  sha256 text not null,
  storage_path text not null,
  fetched_at timestamptz not null default now(),
  unique (council_id, url)
);
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references kb_sources(id) on delete cascade,
  heading text,
  content text not null,
  embedding extensions.vector(1536)
);
create index on kb_chunks using hnsw (embedding extensions.vector_cosine_ops);
create table rules (
  id text primary key,
  council_id uuid not null references councils(id),
  condition jsonb not null,      -- {"all":[{"path":"alcohol.supply","eq":"sold"}]}, see lib/rules/engine.ts
  outcome jsonb not null,        -- {"documentType":"special_licence_application","reason":"Alcohol will be sold"}
  source_id uuid references kb_sources(id),
  source_url text not null,
  source_quote text not null,
  verified boolean not null default false,
  last_checked date
);
create table checklists (
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references councils(id),
  document_type text not null,
  items jsonb not null,          -- [{id, text, sourceQuote}]
  source_url text,
  verified boolean not null default false,
  last_checked date,
  unique (council_id, document_type)
);
create table templates (
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references councils(id),
  document_type text not null,
  sections jsonb not null,       -- ["Event overview", ...]
  source_url text,
  unique (council_id, document_type)
);
create table form_fields (       -- P2: official form filling
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references councils(id),
  form_name text not null,
  field_key text not null,
  label text not null,
  profile_path text
);

create or replace function match_kb_chunks(council_slug text, query_embedding extensions.vector(1536), match_count int default 5)
returns table (id uuid, heading text, content text, url text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.heading, c.content, s.url, 1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c
  join kb_sources s on s.id = c.source_id
  join councils co on co.id = s.council_id
  where co.slug = council_slug
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- App ----------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'club',
  council_id uuid references councils(id),
  created_at timestamptz default now()
);
create table memberships (
  org_id uuid references organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (org_id, user_id)
);
create table events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  council_id uuid not null references councils(id),
  description text not null,
  profile jsonb,                 -- EventProfile
  classification jsonb,          -- Classification
  status text not null default 'draft',
  eventbrite_event_id text,
  created_at timestamptz default now()
);
create table requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  rule_id text not null,         -- rules.id, or a static rule id from lib/rules
  document_type text not null,
  reason text not null,
  source_url text,
  last_checked date,
  unique (event_id, document_type)
);
create table documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  document_type text not null,
  content jsonb,                 -- DraftDocument
  check_results jsonb,           -- CheckResult
  status text not null default 'pending' check (status in ('pending','drafted','needs_fix','ready','manual')),
  updated_at timestamptz default now(),
  unique (event_id, document_type)
);
create table deadlines (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  document_type text not null,
  label text not null,
  legal_minimum date,
  recommended date not null,
  reminded_14_at timestamptz,
  reminded_3_at timestamptz,
  unique (event_id, document_type)
);
create table licences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  type text not null,
  holder_name text,
  expires_on date not null
);

-- ---------- Row-level security ----------
alter table councils enable row level security;
alter table kb_sources enable row level security;
alter table kb_chunks enable row level security;
alter table rules enable row level security;
alter table checklists enable row level security;
alter table templates enable row level security;
alter table form_fields enable row level security;

alter table organisations enable row level security;
alter table memberships enable row level security;
alter table events enable row level security;
alter table requirements enable row level security;
alter table documents enable row level security;
alter table deadlines enable row level security;
alter table licences enable row level security;

create policy "own memberships" on memberships for select using (user_id = auth.uid());
create policy "member orgs" on organisations for select using (id in (select org_id from memberships where user_id = auth.uid()));
create policy "member events" on events for all using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "member licences" on licences for all using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "event children req" on requirements for all using (event_id in (select id from events));
create policy "event children docs" on documents for all using (event_id in (select id from events));
create policy "event children deadlines" on deadlines for all using (event_id in (select id from events));

-- ---------- Seed ----------
insert into councils (slug, name) values ('ccc','Christchurch City Council'), ('waimakariri','Waimakariri District Council');
insert into storage.buckets (id, name, public) values ('kb', 'kb', false) on conflict (id) do nothing;
