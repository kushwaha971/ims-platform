-- Belt and braces: `apps/common/migrations/0001_enable_extensions.py` installs
-- pg_trgm too, so a database created any other way still gets it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
