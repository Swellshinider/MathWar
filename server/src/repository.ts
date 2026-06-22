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
  deleteFinishedBefore(cutoff: Date): Promise<number>;
  close(): Promise<void>;
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, MatchState>();
  private readonly commands = new Set<string>();

  async initialize(): Promise<void> {}

  async create(state: MatchState, commandId: string): Promise<boolean> {
    if ([...this.matches.values()].some((match) => match.roomCode === state.roomCode)) return false;
    this.matches.set(state.id, structuredClone(state));
    this.commands.add(`${state.id}:${commandId}`);
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

  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [id, match] of this.matches) {
      if (match.status === 'ended' && new Date(match.updatedAt) < cutoff) {
        this.matches.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async close(): Promise<void> {}
}
