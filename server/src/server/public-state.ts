import {
  FormulaFrenzyMatchState,
  GameId,
  MultiplayerMatchState,
  sanitizeFormulaFrenzyState,
} from '@math-war/game-engine';

export function roomName(matchId: string): string {
  return `match:${matchId}`;
}

export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

export function stateGameId(state: MultiplayerMatchState): GameId {
  return state.gameId ?? 'equation-artillery';
}

export function publicState<T extends MultiplayerMatchState>(state: T): T {
  return (
    stateGameId(state) === 'formula-frenzy'
      ? sanitizeFormulaFrenzyState(state as FormulaFrenzyMatchState)
      : state
  ) as T;
}

export function setPlayerConnected(
  state: MultiplayerMatchState,
  userId: string,
  connected: boolean,
): MultiplayerMatchState {
  const players = state.players.map((player) =>
    player.userId === userId ? { ...player, connected } : player,
  );
  if (stateGameId(state) !== 'formula-frenzy') return { ...state, players };
  return {
    ...(state as FormulaFrenzyMatchState),
    players,
    formulaPlayers: (state as FormulaFrenzyMatchState).formulaPlayers.map((player) =>
      player.userId === userId ? { ...player, connected } : player,
    ),
  };
}
