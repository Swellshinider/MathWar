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

export interface CharacterState {
  readonly id: number;
  readonly ownerUserId: string;
  readonly displayName: string;
  readonly position: Point;
  readonly radius: number;
  readonly direction: 1 | -1;
  readonly alive: boolean;
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

export type GameId = 'equation-artillery' | 'formula-frenzy';
export type MatchStatus = 'waiting' | 'active' | 'paused' | 'ended';
export type MatchEndReason = 'hit' | 'abandonment' | 'left' | 'timeout' | 'out-of-hearts';

export interface ShotHistoryEntry {
  readonly commandId: string;
  readonly shooterUserId: string;
  readonly shooterCharacterId: number | null;
  readonly equation: string;
}

export interface MatchState {
  readonly gameId?: 'equation-artillery';
  readonly id: string;
  readonly roomCode: string;
  readonly seed: string;
  readonly version: number;
  readonly status: MatchStatus;
  readonly players: readonly PlayerState[];
  readonly characters: readonly CharacterState[];
  readonly walls: readonly Wall[];
  readonly equationHistory: readonly ShotHistoryEntry[];
  readonly turnUserId: string | null;
  readonly turnCharacterId: number | null;
  readonly winnerUserId: string | null;
  readonly endReason: MatchEndReason | null;
  readonly disconnectedUserId: string | null;
  readonly reconnectDeadline: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type FormulaOperation =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'power'
  | 'root';

export interface FormulaLevelConfig {
  readonly level: number;
  readonly name: string;
  readonly allowedOperations: readonly FormulaOperation[];
  readonly minNumber: number;
  readonly maxNumber: number;
  readonly expressionLength: number;
  readonly allowParentheses: boolean;
  readonly allowNestedParentheses: boolean;
  readonly requirePrecedence: boolean;
  readonly allowNegativeResults: boolean;
  readonly exactDivisionOnly: boolean;
  readonly timeLimitSeconds: number;
  readonly xpRequired: number;
  readonly examples: readonly string[];
}

export interface FormulaProblem {
  readonly prompt: string;
  readonly answer?: number;
  readonly hint?: string;
  readonly level: number;
  readonly levelName: string;
  readonly deadlineMs: number;
}

export interface FormulaFrenzyPlayerState {
  readonly userId: string;
  readonly displayName: string;
  readonly connected: boolean;
  readonly score: number;
  readonly experience: number;
  readonly level: number;
  readonly xp: number;
  readonly xpRequired: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly hearts: number;
  readonly hintsRemaining: number;
  readonly currentHint: string | null;
  readonly highestLevel: number;
  readonly totalCorrect: number;
  readonly totalSolveTimeMs: number;
  readonly currentProblem: FormulaProblem & {
    readonly answer?: number;
    readonly startedAt: string;
  };
}

export interface FormulaFrenzyMatchState {
  readonly gameId: 'formula-frenzy';
  readonly id: string;
  readonly roomCode: string;
  readonly seed: string;
  readonly version: number;
  readonly status: MatchStatus;
  readonly players: readonly PlayerState[];
  readonly formulaPlayers: readonly FormulaFrenzyPlayerState[];
  readonly winnerUserId: string | null;
  readonly endReason: MatchEndReason | null;
  readonly disconnectedUserId: string | null;
  readonly reconnectDeadline: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MultiplayerMatchState = MatchState | FormulaFrenzyMatchState;

export interface VersionedCommand {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly gameId?: GameId;
}

export interface FireCommand extends VersionedCommand {
  readonly equation: string;
}

export interface RoomJoinCommand extends VersionedCommand {
  readonly roomCode: string;
}

export interface FormulaFrenzyAnswerCommand extends VersionedCommand {
  readonly answer: number;
}

export type FormulaFrenzyHintCommand = VersionedCommand;

export interface FormulaFrenzyTypingCommand {
  readonly input: string;
}

export interface ShotResolvedEvent {
  readonly commandId: string;
  readonly matchId: string;
  readonly version: number;
  readonly shooterUserId: string;
  readonly shooterCharacterId: number | null;
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
