CREATE TABLE IF NOT EXISTS account_game_runs (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id text NOT NULL CHECK (run_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  game_id text NOT NULL CHECK (game_id = 'formula-frenzy'),
  difficulty text NOT NULL CHECK (difficulty IN ('normal', 'hardcore')),
  score integer NOT NULL CHECK (score >= 0),
  level integer NOT NULL CHECK (level >= 1),
  average_time_ms integer CHECK (average_time_ms IS NULL OR average_time_ms >= 0),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, run_id)
);

CREATE INDEX IF NOT EXISTS account_game_runs_account_game_created_idx
  ON account_game_runs (account_id, game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_game_stats (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id = 'formula-frenzy'),
  difficulty text NOT NULL CHECK (difficulty IN ('normal', 'hardcore')),
  runs_count integer NOT NULL CHECK (runs_count >= 0),
  total_score bigint NOT NULL CHECK (total_score >= 0),
  best_score integer NOT NULL CHECK (best_score >= 0),
  best_level integer NOT NULL CHECK (best_level >= 1),
  best_streak integer NOT NULL CHECK (best_streak >= 0),
  total_correct integer NOT NULL CHECK (total_correct >= 0),
  best_average_time_ms integer CHECK (best_average_time_ms IS NULL OR best_average_time_ms >= 0),
  last_played_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, game_id, difficulty)
);

CREATE TABLE IF NOT EXISTS account_achievements (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, achievement_id)
);
