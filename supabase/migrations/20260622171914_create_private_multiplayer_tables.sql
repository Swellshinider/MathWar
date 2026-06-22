create schema if not exists private;

create table private.multiplayer_matches (
  id uuid primary key,
  room_code varchar(8) not null unique,
  state jsonb not null,
  version integer not null,
  status varchar(16) not null,
  updated_at timestamptz not null
);

create table private.multiplayer_commands (
  match_id uuid not null references private.multiplayer_matches(id) on delete cascade,
  command_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (match_id, command_id)
);

create index multiplayer_matches_status_idx
  on private.multiplayer_matches(status, updated_at);

alter table private.multiplayer_matches enable row level security;
alter table private.multiplayer_commands enable row level security;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
