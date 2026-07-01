create index if not exists multiplayer_matches_active_players_idx
  on private.multiplayer_matches using gin ((state->'players'))
  where status <> 'ended';
