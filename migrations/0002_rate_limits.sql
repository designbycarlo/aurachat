-- 0002_rate_limits.sql — persist brute-force counters so protection survives
-- process restarts (the Railway free dyno sleeps/recycles, which previously
-- reset the in-memory limiter and gave attackers a fresh attempt budget).
--
-- Each row is one (key, window-start) bucket. Stale rows older than 1 hour are
-- ignored at read time and pruned lazily, so the table stays tiny and cheap.

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  start     BIGINT NOT NULL,   -- window start (ms epoch)
  count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_start ON rate_limits(start);
