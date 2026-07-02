import { MultiplayerMatchState } from '@math-war/game-engine';

export function isMatchPlayer(state: MultiplayerMatchState, userId: string): boolean {
  return state.players.some((player) => player.userId === userId);
}

export function isMatchHost(state: MultiplayerMatchState, userId: string): boolean {
  return state.players[0]?.userId === userId;
}

export function canJoinWaitingRoom(state: MultiplayerMatchState, userId: string): boolean {
  return state.status === 'waiting' && state.players.length < 2 && !isMatchPlayer(state, userId);
}

export function canStartFormulaMatch(state: MultiplayerMatchState, userId: string): boolean {
  return isMatchHost(state, userId);
}
