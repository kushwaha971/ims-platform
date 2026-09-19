-- scripts/postgres-init/01-extensions.sql
-- Runs once, as the bootstrap superuser, on an empty data directory only
-- (postgres image convention). Part 29 §29.8.4: "No superuser access from the
-- application role. Extensions (pg_trgm, pg_stat_statements) are created by the
-- init script as the bootstrap superuser, once."
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS btree_gin;
