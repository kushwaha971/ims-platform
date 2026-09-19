-- scripts/postgres-init/02-roles.sql
-- Part 29 §29.8.4: two roles. `udhaarbook` (owner, used by the application and by
-- migrations) is created by the image from POSTGRES_USER. `udhaarbook_backup` is
-- read-only and is what the backup service uses, so that a compromised backup
-- path cannot write.
--
-- The password is set from the environment at first init; rotate it with
--   ALTER ROLE udhaarbook_backup WITH PASSWORD '…';
-- and update .env, per §29.8.5 rule 5.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'udhaarbook_backup') THEN
        EXECUTE format(
            'CREATE ROLE udhaarbook_backup LOGIN PASSWORD %L',
            coalesce(current_setting('custom.backup_password', true), 'change-me-on-first-deploy')
        );
    END IF;
END
$$;

GRANT CONNECT ON DATABASE :"POSTGRES_DB" TO udhaarbook_backup;
GRANT USAGE ON SCHEMA public TO udhaarbook_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO udhaarbook_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO udhaarbook_backup;
