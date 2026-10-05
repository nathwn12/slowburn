-- Track file modification time (additive-only, no table rewrite, no data loss).
--
--   modified   epoch milliseconds (INTEGER), NULL = the file's mtime could not
--              be read. Intentionally nullable and deliberately NOT a `0`
--              sentinel: 0 epoch is a real instant, so NULL is the only honest
--              "unknown". Stored as an integer, not an ISO-8601 string, so a
--              comparator cannot accidentally sort it as text.
--
-- Existing rows are left NULL: there is no truthful mtime to infer for a file
-- that is no longer on disk, and a rescan will fill it in for files that are.

ALTER TABLE tracks ADD COLUMN modified INTEGER;
