CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY,
  game_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  level integer NOT NULL CHECK (level >= 1),
  average_time_ms integer CHECK (average_time_ms IS NULL OR average_time_ms >= 0),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, account_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_entries_rank_idx
  ON leaderboard_entries (
    game_id,
    score DESC,
    level DESC,
    average_time_ms ASC NULLS LAST,
    best_streak DESC,
    updated_at ASC,
    id ASC
  );
