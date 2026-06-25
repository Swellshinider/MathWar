import { MatchState } from '@math-war/game-engine';

export type UpdateResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly reason: 'duplicate' | 'stale' | 'missing' };

export interface MatchRepository {
  initialize(): Promise<void>;
  create(state: MatchState, commandId: string): Promise<boolean>;
  findByCode(roomCode: string): Promise<MatchState | null>;
  findById(id: string): Promise<MatchState | null>;
  findActiveByUser(userId: string): Promise<MatchState | null>;
  update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MatchState) => MatchState,
  ): Promise<UpdateResult>;
  listExpiredReconnects(now: Date): Promise<readonly MatchState[]>;
  markRoomEmpty(id: string, emptySince: Date): Promise<void>;
  clearRoomEmpty(id: string): Promise<void>;
  deleteEmptyBefore(cutoff: Date): Promise<number>;
  deleteFinishedBefore(cutoff: Date): Promise<number>;
  delete(id: string): Promise<boolean>;
  close(): Promise<void>;
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, MatchState>();
  private readonly commands = new Set<string>();
  private readonly emptySince = new Map<string, number>();

  async initialize(): Promise<void> {}

  async create(state: MatchState, commandId: string): Promise<boolean> {
    if ([...this.matches.values()].some((match) => match.roomCode === state.roomCode)) return false;
    this.matches.set(state.id, structuredClone(state));
    this.commands.add(`${state.id}:${commandId}`);
    this.emptySince.delete(state.id);
    return true;
  }

  async findByCode(roomCode: string): Promise<MatchState | null> {
    const state = [...this.matches.values()].find((match) => match.roomCode === roomCode);
    return state ? structuredClone(state) : null;
  }

  async findById(id: string): Promise<MatchState | null> {
    const state = this.matches.get(id);
    return state ? structuredClone(state) : null;
  }

  async findActiveByUser(userId: string): Promise<MatchState | null> {
    const state = [...this.matches.values()].find(
      (match) =>
        match.status !== 'ended' && match.players.some((player) => player.userId === userId),
    );
    return state ? structuredClone(state) : null;
  }

  async update(
    id: string,
    expectedVersion: number,
    commandId: string,
    transform: (state: MatchState) => MatchState,
  ): Promise<UpdateResult> {
    const key = `${id}:${commandId}`;
    if (this.commands.has(key)) return { ok: false, reason: 'duplicate' };
    const current = this.matches.get(id);
    if (!current) return { ok: false, reason: 'missing' };
    if (current.version !== expectedVersion) return { ok: false, reason: 'stale' };
    const next = transform(structuredClone(current));
    this.matches.set(id, structuredClone(next));
    this.commands.add(key);
    return { ok: true, state: structuredClone(next) };
  }

  async listExpiredReconnects(now: Date): Promise<readonly MatchState[]> {
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
    if (!this.matches.has(id)) return false;
    this.matches.delete(id);
    this.emptySince.delete(id);
    const prefix = `${id}:`;
    for (const key of [...this.commands].filter((command) => command.startsWith(prefix))) {
      this.commands.delete(key);
    }
    return true;
  }

  async close(): Promise<void> {}
}
