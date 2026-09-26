-- Christchurch City Council (ccc) is the only council. Removes every other council row and its knowledge,
-- keeps organisers' events by moving them to ccc (POST /api/events/:id/requirements refreshes their documents),
-- then narrows the slug check. Every statement is scoped by a WHERE clause and safe to re-run.

-- ccc must exist before anything is moved onto it (0001 seeds it; this covers a hand-edited project).
insert into councils (slug, name) values ('ccc', 'Christchurch City Council') on conflict (slug) do nothing;

-- App rows: keep them, point them at ccc.
update events set council_id = (select id from councils where slug = 'ccc')
  where council_id in (select id from councils where slug <> 'ccc');
update organisations set council_id = (select id from councils where slug = 'ccc')
  where council_id in (select id from councils where slug <> 'ccc');

-- Knowledge rows belong to their council, so they go with it. rules.source_id has no cascade: clear it first.
update rules set source_id = null
  where source_id in (select s.id from kb_sources s join councils c on c.id = s.council_id where c.slug <> 'ccc');
delete from rules where council_id in (select id from councils where slug <> 'ccc');
delete from checklists where council_id in (select id from councils where slug <> 'ccc');
delete from templates where council_id in (select id from councils where slug <> 'ccc');
delete from form_fields where council_id in (select id from councils where slug <> 'ccc');
delete from kb_sources where council_id in (select id from councils where slug <> 'ccc'); -- kb_chunks cascade
delete from councils where slug <> 'ccc';

alter table councils drop constraint if exists councils_slug_check;
alter table councils add constraint councils_slug_check check (slug = 'ccc');
