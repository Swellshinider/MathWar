ALTER TABLE leaderboard_entries
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'normal';

ALTER TABLE leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_difficulty_check;

ALTER TABLE leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_difficulty_check
  CHECK (difficulty IN ('normal', 'hardcore'));

ALTER TABLE leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_game_id_account_id_key;

ALTER TABLE leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_game_id_difficulty_account_id_key;

ALTER TABLE leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_game_id_difficulty_account_id_key
  UNIQUE (game_id, difficulty, account_id);

DROP INDEX IF EXISTS leaderboard_entries_rank_idx;

CREATE INDEX leaderboard_entries_rank_idx
  ON leaderboard_entries (
    game_id,
    difficulty,
    score DESC,
    level DESC,
    average_time_ms ASC NULLS LAST,
    best_streak DESC,
    updated_at ASC,
    id ASC
  );
