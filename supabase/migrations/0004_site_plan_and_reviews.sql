-- The organiser's saved site plan (lib/schemas SitePlan). Null until they move something. Safe to re-run.
alter table events add column if not exists site_plan jsonb;

-- The organiser ticked "I've read this draft and checked it". Cleared whenever the draft's text changes.
alter table documents add column if not exists reviewed_at timestamptz;
