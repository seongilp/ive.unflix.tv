-- Risk intelligence time series. One row per (member, source) per collect run.
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,              -- epoch ms of the collect run
  member TEXT NOT NULL,             -- 'all' or member key (yujin, gaeul, …)
  source TEXT NOT NULL,             -- 'all' | youtube | yt_ext | news | dc | instagram
  mentions INTEGER NOT NULL,
  positive INTEGER NOT NULL,
  neutral INTEGER NOT NULL,
  negative INTEGER NOT NULL,
  neg_weighted REAL NOT NULL DEFAULT 0,   -- like-weighted negative share (0..1)
  risk_json TEXT NOT NULL DEFAULT '{}',   -- {category: count}
  keywords_json TEXT NOT NULL DEFAULT '[]' -- [{word,count}] top N
);
CREATE INDEX IF NOT EXISTS idx_snapshots_key ON snapshots(member, source, ts);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);

-- Fired alerts (also mirrored to the webhook when configured).
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  member TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,               -- volume_spike | sentiment_shift | new_keyword | risk_category
  severity TEXT NOT NULL,           -- info | warning | critical
  message TEXT NOT NULL,
  value REAL,
  baseline REAL
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
