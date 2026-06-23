create schema if not exists private;

create table if not exists private.multiplayer_matches (
  id uuid primary key,
  room_code varchar(8) not null unique,
  state jsonb not null,
  version integer not null,
  status varchar(16) not null,
  updated_at timestamptz not null
);

create table if not exists private.multiplayer_commands (
  match_id uuid not null references private.multiplayer_matches(id) on delete cascade,
  command_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (match_id, command_id)
);

create index if not exists multiplayer_matches_status_idx
  on private.multiplayer_matches(status, updated_at);
