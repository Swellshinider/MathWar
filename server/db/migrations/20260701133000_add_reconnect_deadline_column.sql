alter table private.multiplayer_matches
  add column if not exists reconnect_deadline timestamptz;

update private.multiplayer_matches
set reconnect_deadline = nullif(state->>'reconnectDeadline', '')::timestamptz
where reconnect_deadline is null
  and state ? 'reconnectDeadline'
  and nullif(state->>'reconnectDeadline', '') is not null;

create index if not exists multiplayer_matches_reconnect_deadline_idx
  on private.multiplayer_matches(reconnect_deadline)
  where reconnect_deadline is not null;
