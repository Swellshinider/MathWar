import { MultiplayerMatchState } from '@math-war/game-engine';

export type UpdateResult =
  | { readonly ok: true; readonly state: MultiplayerMatchState }
  | { readonly ok: false; readonly reason: 'duplicate' | 'stale' | 'missing' };

export interface MatchRepository {
  initialize(): Promise<void>;
  create(state: MultiplayerMatchState, commandId: string): Promise<boolean>;
  findByCode(roomCode: string): Promise<MultiplayerMatchState | null>;
  findById(id: string): Promise<MultiplayerMatchState | null>;
  findActiveByUser(userId: string): Promise<MultiplayerMatchState | null>;
  update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MultiplayerMatchState) => MultiplayerMatchState,
  ): Promise<UpdateResult>;
  listExpiredReconnects(now: Date): Promise<readonly MultiplayerMatchState[]>;
  markRoomEmpty(id: string, emptySince: Date): Promise<void>;
  clearRoomEmpty(id: string): Promise<void>;
  deleteEmptyBefore(cutoff: Date): Promise<number>;
  deleteFinishedBefore(cutoff: Date): Promise<number>;
  delete(id: string): Promise<boolean>;
  close(): Promise<void>;
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, MultiplayerMatchState>();
  private readonly commands = new Set<string>();
  private readonly emptySince = new Map<string, number>();
  private readonly roomIdsByCode = new Map<string, string>();
  private readonly activeMatchIdsByUser = new Map<string, string>();

  async initialize(): Promise<void> {}

  async create(state: MultiplayerMatchState, commandId: string): Promise<boolean> {
    if (this.roomIdsByCode.has(state.roomCode)) return false;
    this.matches.set(state.id, structuredClone(state));
    this.commands.add(`${state.id}:${commandId}`);
    this.emptySince.delete(state.id);
    this.indexMatch(state);
    return true;
  }

  async findByCode(roomCode: string): Promise<MultiplayerMatchState | null> {
    const id = this.roomIdsByCode.get(roomCode);
    const state = id ? this.matches.get(id) : null;
    return state ? structuredClone(state) : null;
  }

  async findById(id: string): Promise<MultiplayerMatchState | null> {
    const state = this.matches.get(id);
    return state ? structuredClone(state) : null;
  }

  async findActiveByUser(userId: string): Promise<MultiplayerMatchState | null> {
    const id = this.activeMatchIdsByUser.get(userId);
    const state = id ? this.matches.get(id) : null;
    return state ? structuredClone(state) : null;
  }

  async update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MultiplayerMatchState) => MultiplayerMatchState,
  ): Promise<UpdateResult> {
    const key = `${id}:${commandId}`;
    if (this.commands.has(key)) return { ok: false, reason: 'duplicate' };
    const current = this.matches.get(id);
    if (!current) return { ok: false, reason: 'missing' };
    if (current.version !== expectedVersion) return { ok: false, reason: 'stale' };
    const next = transform(structuredClone(current));
    this.matches.set(id, structuredClone(next));
    this.commands.add(key);
    this.reindexMatch(current, next);
    return { ok: true, state: structuredClone(next) };
  }

  async listExpiredReconnects(now: Date): Promise<readonly MultiplayerMatchState[]> {
    return [...this.matches.values()]
      .filter(
        (match) =>
          match.status === 'paused' &&
          match.reconnectDeadline !== null &&
          new Date(match.reconnectDeadline).getTime() <= now.getTime(),
      )
      .map((match) => structuredClone(match));
  }

  async markRoomEmpty(id: string, emptySince: Date): Promise<void> {
    if (this.matches.has(id)) this.emptySince.set(id, emptySince.getTime());
  }

  async clearRoomEmpty(id: string): Promise<void> {
    this.emptySince.delete(id);
  }

  async deleteEmptyBefore(cutoff: Date): Promise<number> {
    const cutoffTime = cutoff.getTime();
    let deleted = 0;
    for (const [id, emptySince] of this.emptySince) {
      if (emptySince <= cutoffTime && this.deleteMatch(id)) deleted += 1;
    }
    return deleted;
  }

  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [id, match] of this.matches) {
      if (match.status === 'ended' && new Date(match.updatedAt) < cutoff) {
        this.deleteMatch(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async delete(id: string): Promise<boolean> {
    return this.deleteMatch(id);
  }

  private deleteMatch(id: string): boolean {
    const match = this.matches.get(id);
    if (!match) return false;
    this.matches.delete(id);
    this.emptySince.delete(id);
    this.removeMatchIndex(match);
    const prefix = `${id}:`;
    for (const key of [...this.commands].filter((command) => command.startsWith(prefix))) {
      this.commands.delete(key);
    }
    return true;
  }

  private reindexMatch(previous: MultiplayerMatchState, next: MultiplayerMatchState): void {
    this.removeMatchIndex(previous);
    this.indexMatch(next);
  }

  private indexMatch(match: MultiplayerMatchState): void {
    this.roomIdsByCode.set(match.roomCode, match.id);
    if (match.status === 'ended') return;
    for (const player of match.players) {
      this.activeMatchIdsByUser.set(player.userId, match.id);
    }
  }

  private removeMatchIndex(match: MultiplayerMatchState): void {
    if (this.roomIdsByCode.get(match.roomCode) === match.id) {
      this.roomIdsByCode.delete(match.roomCode);
    }
    for (const player of match.players) {
      if (this.activeMatchIdsByUser.get(player.userId) === match.id) {
        this.activeMatchIdsByUser.delete(player.userId);
      }
    }
  }

  async close(): Promise<void> {}
}
