import {
  buildFreePracticePreviewTrail,
  buildWallStamp,
  deleteNearestSandboxObject,
  placeSandboxTarget,
  placeSandboxWall,
} from './free-practice-sandbox';
import { Wall } from '../models/wall';

describe('Free Practice sandbox helpers', () => {
  const player = { position: { x: -2, y: 0 }, radius: 0.32 };

  it('builds wall stamps by shape and size with bounded wall pieces', () => {
    const vertical = buildWallStamp({
      id: 3,
      firstPieceId: 10,
      shape: 'vertical',
      size: 'small',
      center: { x: 1, y: 0 },
    });
    const circle = buildWallStamp({
      id: 4,
      firstPieceId: 20,
      shape: 'circle',
      size: 'medium',
      center: { x: 2, y: 0 },
    });
    const square = buildWallStamp({
      id: 5,
      firstPieceId: 40,
      shape: 'square',
      size: 'large',
      center: { x: 4, y: 0 },
    });

    expect(vertical.shape).toBe('vertical');
    expect(vertical.pieces).toHaveLength(5);
    expect(circle.pieces.length).toBeGreaterThan(vertical.pieces.length);
    expect(square.pieces.length).toBeGreaterThan(circle.pieces.length);
    expect(square.pieces[0].id).toBe(40);
  });

  it('places enemies and rejects overlap with the player, existing enemies, and walls', () => {
    const walls: readonly Wall[] = [
      buildWallStamp({
        id: 1,
        firstPieceId: 1,
        shape: 'square',
        size: 'small',
        center: { x: 4, y: 0 },
      }),
    ];
    const targets = [{ id: 1, center: { x: 1, y: 0 }, width: 1, height: 1 }];

    expect(placeSandboxTarget({ point: { x: -2, y: 0 }, player, targets: [], walls })).toBeNull();
    expect(placeSandboxTarget({ point: { x: 1.2, y: 0 }, player, targets, walls })).toBeNull();
    expect(placeSandboxTarget({ point: { x: 4, y: 0 }, player, targets, walls })).toBeNull();
    expect(
      placeSandboxTarget({ point: { x: 6, y: 1 }, player, targets, walls, nextTargetId: 7 }),
    ).toEqual({ id: 7, center: { x: 6, y: 1 }, width: 1, height: 1 });
  });

  it('places wall stamps only when in bounds and not overlapping sandbox objects', () => {
    const targets = [{ id: 1, center: { x: 3, y: 0 }, width: 1, height: 1 }];
    const walls: readonly Wall[] = [
      buildWallStamp({
        id: 1,
        firstPieceId: 1,
        shape: 'vertical',
        size: 'small',
        center: { x: 5, y: 0 },
      }),
    ];

    expect(
      placeSandboxWall({
        point: { x: -2, y: 0 },
        shape: 'circle',
        size: 'small',
        player,
        targets: [],
        walls: [],
      }),
    ).toBeNull();
    expect(
      placeSandboxWall({
        point: { x: 16, y: 10 },
        shape: 'square',
        size: 'large',
        player,
        targets,
        walls,
      }),
    ).toBeNull();
    expect(
      placeSandboxWall({
        point: { x: 3, y: 0 },
        shape: 'triangle',
        size: 'medium',
        player,
        targets,
        walls,
      }),
    ).toBeNull();
    expect(
      placeSandboxWall({
        point: { x: 0, y: 3 },
        shape: 'triangle',
        size: 'medium',
        player,
        targets,
        walls,
        nextWallId: 8,
        nextPieceId: 30,
      })?.id,
    ).toBe(8);
  });

  it('deletes the nearest clicked enemy or wall stamp', () => {
    const targets = [
      { id: 1, center: { x: 0, y: 0 }, width: 1, height: 1 },
      { id: 2, center: { x: 3, y: 0 }, width: 1, height: 1 },
    ];
    const walls = [
      buildWallStamp({
        id: 5,
        firstPieceId: 1,
        shape: 'vertical',
        size: 'small',
        center: { x: 4, y: 0 },
      }),
    ];

    expect(deleteNearestSandboxObject({ point: { x: 3.1, y: 0 }, targets, walls })).toEqual({
      targets: [targets[0]],
      walls,
      deleted: true,
    });
    expect(deleteNearestSandboxObject({ point: { x: 4.2, y: 0 }, targets, walls })).toEqual({
      targets,
      walls: [],
      deleted: true,
    });
    expect(deleteNearestSandboxObject({ point: { x: -8, y: 0 }, targets, walls }).deleted).toBe(
      false,
    );
  });

  it('builds a non-mutating preview trail from the current equation and sandbox objects', () => {
    const targets = [{ id: 1, center: { x: -1, y: 0 }, width: 1, height: 1 }];
    const walls = [
      buildWallStamp({
        id: 1,
        firstPieceId: 1,
        shape: 'vertical',
        size: 'small',
        center: { x: 2, y: 0 },
      }),
    ];

    const preview = buildFreePracticePreviewTrail({
      equation: '0',
      player,
      direction: 1,
      targets,
      walls,
    });

    expect(preview.length).toBeGreaterThan(1);
    expect(preview.at(-1)?.x).toBeGreaterThan(player.position.x);
    expect(targets).toHaveLength(1);
    expect(walls[0].pieces).toHaveLength(5);
    expect(
      buildFreePracticePreviewTrail({ equation: 'x+(', player, direction: 1, targets, walls }),
    ).toEqual([]);
  });
});
