alter table private.multiplayer_matches
  alter column room_code type varchar(9);

alter table private.multiplayer_matches
  add column if not exists empty_since timestamptz;

create index if not exists multiplayer_matches_empty_since_idx
  on private.multiplayer_matches(empty_since)
  where empty_since is not null;
