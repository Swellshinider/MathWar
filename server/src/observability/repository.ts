import { MatchRepository, UpdateResult } from '../repository.js';
import { MathWarMetrics, nowSeconds, RepositoryOperation } from './metrics.js';

type RepositoryMethod<T> = () => Promise<T>;

export class InstrumentedMatchRepository implements MatchRepository {
  constructor(
    private readonly inner: MatchRepository,
    private readonly metrics: MathWarMetrics,
  ) {}

  initialize(): Promise<void> {
    return this.observe('initialize', () => this.inner.initialize());
  }

  create(...args: Parameters<MatchRepository['create']>): Promise<boolean> {
    return this.observe('create', () => this.inner.create(...args));
  }

  findByCode(...args: Parameters<MatchRepository['findByCode']>) {
    return this.observe('findByCode', () => this.inner.findByCode(...args));
  }

  findById(...args: Parameters<MatchRepository['findById']>) {
    return this.observe('findById', () => this.inner.findById(...args));
  }

  findActiveByUser(...args: Parameters<MatchRepository['findActiveByUser']>) {
    return this.observe('findActiveByUser', () => this.inner.findActiveByUser(...args));
  }

  async update(...args: Parameters<MatchRepository['update']>): Promise<UpdateResult> {
    const result = await this.observe('update', () => this.inner.update(...args));
    this.metrics.recordRepositoryUpdateResult(result.ok ? 'ok' : result.reason);
    return result;
  }

  listExpiredReconnects(...args: Parameters<MatchRepository['listExpiredReconnects']>) {
    return this.observe('listExpiredReconnects', () => this.inner.listExpiredReconnects(...args));
  }

  markRoomEmpty(...args: Parameters<MatchRepository['markRoomEmpty']>) {
    return this.observe('markRoomEmpty', () => this.inner.markRoomEmpty(...args));
  }

  clearRoomEmpty(...args: Parameters<MatchRepository['clearRoomEmpty']>) {
    return this.observe('clearRoomEmpty', () => this.inner.clearRoomEmpty(...args));
  }

  deleteEmptyBefore(...args: Parameters<MatchRepository['deleteEmptyBefore']>) {
    return this.observe('deleteEmptyBefore', () => this.inner.deleteEmptyBefore(...args));
  }

  deleteFinishedBefore(...args: Parameters<MatchRepository['deleteFinishedBefore']>) {
    return this.observe('deleteFinishedBefore', () => this.inner.deleteFinishedBefore(...args));
  }

  delete(...args: Parameters<MatchRepository['delete']>) {
    return this.observe('delete', () => this.inner.delete(...args));
  }

  close(): Promise<void> {
    return this.observe('close', () => this.inner.close());
  }

  private async observe<T>(
    operation: RepositoryOperation,
    method: RepositoryMethod<T>,
  ): Promise<T> {
    const start = nowSeconds();
    try {
      const result = await method();
      this.metrics.observeRepository(operation, 'ok', nowSeconds() - start);
      return result;
    } catch (error) {
      this.metrics.observeRepository(operation, 'error', nowSeconds() - start);
      throw error;
    }
  }
}
