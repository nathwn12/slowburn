-- A-B section loops, at most one region per track.
-- track_id is the stable track id (UUID v3 derived from the file path), so a
-- region survives library rescans and full app restarts.
CREATE TABLE IF NOT EXISTS ab_loops (
  track_id TEXT PRIMARY KEY NOT NULL,
  start_seconds REAL, -- A point in seconds, NULL when unset
  end_seconds REAL,   -- B point in seconds, NULL when unset
  CHECK (start_seconds IS NOT NULL OR end_seconds IS NOT NULL)
);
