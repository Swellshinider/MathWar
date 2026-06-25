import { createMatchState } from '@math-war/game-engine';
import { describe, expect, it } from 'vitest';
import { InMemoryMatchRepository } from './repository.js';

describe('InMemoryMatchRepository empty-room cleanup', () => {
  it('deletes only matches whose empty timer has elapsed', async () => {
    const repository = new InMemoryMatchRepository();
    const oldEmpty = createMatchState('old-empty', 'AAAA-BBBB', 'seed-old', {
      userId: 'old-host',
      displayName: 'Old Host',
    });
    const recentEmpty = createMatchState('recent-empty', 'CCCC-DDDD', 'seed-recent', {
      userId: 'recent-host',
      displayName: 'Recent Host',
    });
    const occupied = createMatchState('occupied', 'EEEE-FFFF', 'seed-occupied', {
      userId: 'occupied-host',
      displayName: 'Occupied Host',
    });
    await repository.create(oldEmpty, '00000000-0000-4000-8000-000000000001');
    await repository.create(recentEmpty, '00000000-0000-4000-8000-000000000002');
    await repository.create(occupied, '00000000-0000-4000-8000-000000000003');
    await repository.markRoomEmpty(oldEmpty.id, new Date('2026-06-25T12:00:00.000Z'));
    await repository.markRoomEmpty(recentEmpty.id, new Date('2026-06-25T12:10:30.000Z'));
    await repository.clearRoomEmpty(occupied.id);

    const deleted = await repository.deleteEmptyBefore(new Date('2026-06-25T12:10:00.000Z'));

    expect(deleted).toBe(1);
    expect(await repository.findById(oldEmpty.id)).toBeNull();
    expect(await repository.findById(recentEmpty.id)).not.toBeNull();
    expect(await repository.findById(occupied.id)).not.toBeNull();
  });
});
