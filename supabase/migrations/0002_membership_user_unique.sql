-- Apply to projects that ran 0001_init.sql before the one-org-per-user constraint was added.
create unique index if not exists memberships_user_id_key on memberships(user_id);
