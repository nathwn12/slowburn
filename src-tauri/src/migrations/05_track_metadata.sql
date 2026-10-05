-- Track metadata enrichment (additive-only, no table rewrite, no data loss).
--
-- Column semantics (see Slowburn-ops/backend/metadata-plan.md §3):
--   format       lowercase source format ("flac", "mp3", "m4a", ...), never
--                empty: 'unknown' sentinel when undetectable
--   is_lossless  0/1 derived from format (SQLite has no native bool)
--   sample_rate  Hz, NULL = genuinely unknown (never 0)
--   bit_depth    bits, NULL for lossy formats (never 0)
--   channels     channel count, NULL = unknown
--   bitrate      bits per second, NULL = unknown
--   file_size    bytes via std::fs::metadata, NULL = stat failed
--   date_added   ISO-8601 UTC; migration default below is APPROXIMATE for
--                pre-existing rows (the real add time was never stored)
--   play_count   incremented only by record_play; never reset by a rescan
--   last_played  ISO-8601 UTC, NULL = never played
--
-- SQLite cannot add a column whose DEFAULT is an expression
-- ("Cannot add a column with non-constant default"), so date_added is added
-- with a constant empty-string default and then seeded with migration time.
-- Every production insert binds date_added explicitly, so the empty default is
-- never used outside this migration.

ALTER TABLE tracks ADD COLUMN format TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE tracks ADD COLUMN is_lossless INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN sample_rate INTEGER;
ALTER TABLE tracks ADD COLUMN bit_depth INTEGER;
ALTER TABLE tracks ADD COLUMN channels INTEGER;
ALTER TABLE tracks ADD COLUMN bitrate INTEGER;
ALTER TABLE tracks ADD COLUMN file_size INTEGER;
ALTER TABLE tracks ADD COLUMN date_added TEXT NOT NULL DEFAULT '';
ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN last_played TEXT;

-- Approximate "date added" for rows that predate this migration: the moment
-- the migration ran, not the moment the track was actually added. There is no
-- truthful source for the latter (no timestamp was ever stored).
UPDATE tracks
SET date_added = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE date_added = '';
