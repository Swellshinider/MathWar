export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface PlayerState {
  readonly userId: string;
  readonly displayName: string;
  readonly position: Point;
  readonly radius: number;
  readonly direction: 1 | -1;
  readonly connected: boolean;
}

export interface WallPiece {
  readonly id: number;
  readonly center: Point;
  readonly size: number;
}

export type WallShape = 'vertical' | 'circle' | 'square' | 'triangle';

export interface Wall {
  readonly id: number;
  readonly shape: WallShape;
  readonly pieces: readonly WallPiece[];
}

export type MatchStatus = 'waiting' | 'active' | 'paused' | 'ended';
export type MatchEndReason = 'hit' | 'abandonment' | 'left';

export interface ShotHistoryEntry {
  readonly commandId: string;
  readonly shooterUserId: string;
  readonly equation: string;
}

export interface MatchState {
  readonly id: string;
  readonly roomCode: string;
  readonly seed: string;
  readonly version: number;
  readonly status: MatchStatus;
  readonly players: readonly PlayerState[];
  readonly walls: readonly Wall[];
  readonly equationHistory: readonly ShotHistoryEntry[];
  readonly turnUserId: string | null;
  readonly winnerUserId: string | null;
  readonly endReason: MatchEndReason | null;
  readonly disconnectedUserId: string | null;
  readonly reconnectDeadline: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VersionedCommand {
  readonly commandId: string;
  readonly expectedVersion: number;
}

export interface FireCommand extends VersionedCommand {
  readonly equation: string;
}

export interface RoomJoinCommand extends VersionedCommand {
  readonly roomCode: string;
}

export interface ShotResolvedEvent {
  readonly commandId: string;
  readonly matchId: string;
  readonly version: number;
  readonly shooterUserId: string;
  readonly equation: string;
  readonly trail: readonly Point[];
  readonly impact: 'opponent' | 'wall' | 'bounds' | 'invalid';
  readonly error: string | null;
  readonly state: MatchState;
}

export interface MatchEndedEvent {
  readonly matchId: string;
  readonly version: number;
  readonly winnerUserId: string | null;
  readonly reason: MatchEndReason;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly displayName: string;
}

export interface CommandAck<T = undefined> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly code?: string;
}
