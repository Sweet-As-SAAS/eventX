-- The organiser's saved site plan (lib/schemas SitePlan). Null until they move something. Safe to re-run.
alter table events add column if not exists site_plan jsonb;
