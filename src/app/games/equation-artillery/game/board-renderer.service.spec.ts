import { BoardRenderer } from './board-renderer.service';
import { WORLD_BOUNDS } from '../models/world-bounds';
import { BOARD_PALETTE } from './board-palette';

describe('BoardRenderer', () => {
  it('draws the grid, player, targets, walls, trail, and bullet', () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 80 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    new BoardRenderer().draw(context, { width: 800, height: 500 }, WORLD_BOUNDS, {
      player: { position: { x: -8, y: 0 }, radius: 0.3 },
      characters: [],
      targets: [{ id: 1, center: { x: 5, y: 1 }, width: 1, height: 1 }],
      walls: [
        {
          id: 1,
          shape: 'square',
          pieces: [{ id: 1, center: { x: 0, y: 0 }, size: 0.5 }],
        },
      ],
      bullet: { position: { x: 0, y: 1 }, radius: 0.2 },
      trail: [
        { x: -8, y: 0 },
        { x: 0, y: 1 },
      ],
    });
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 500);
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalledTimes(2);
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalledTimes(2);
  });

  it('draws living multiplayer characters with names, active glow, and function labels', () => {
    const fillStyles: string[] = [];
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 84 })),
      get fillStyle() {
        return fillStyles.at(-1) ?? '';
      },
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
      strokeStyle: '',
      shadowColor: '',
      shadowBlur: 0,
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    new BoardRenderer().draw(context, { width: 800, height: 500 }, WORLD_BOUNDS, {
      player: { position: { x: -8, y: 0 }, radius: 0.3 },
      characters: [
        {
          id: 0,
          displayName: 'Left',
          position: { x: -9, y: 0 },
          radius: 0.32,
          active: true,
          functionLabel: '0.25x',
        },
        {
          id: 3,
          displayName: 'Right',
          position: { x: 9, y: 0 },
          radius: 0.32,
          active: false,
          functionLabel: null,
        },
      ],
      targets: [],
      walls: [],
      bullet: null,
      trail: [],
    });

    expect(context.arc).toHaveBeenCalledTimes(4);
    expect(context.stroke).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith(
      'f(x) = 0.25x',
      expect.any(Number),
      expect.any(Number),
      92,
    );
    expect(context.fillText).toHaveBeenCalledWith('Left', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Right', expect.any(Number), expect.any(Number));
    expect(fillStyles).toContain(BOARD_PALETTE.activePlayerText);
  });

  it('draws a dashed preview trail before the active shot trail and resets the dash', () => {
    const setLineDash = vi.fn();
    const strokeStyles: string[] = [];
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 80 })),
      setLineDash,
      fillStyle: '',
      get strokeStyle() {
        return strokeStyles.at(-1) ?? '';
      },
      set strokeStyle(value: string) {
        strokeStyles.push(value);
      },
      lineWidth: 0,
      shadowColor: '',
      shadowBlur: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    new BoardRenderer().draw(context, { width: 800, height: 500 }, WORLD_BOUNDS, {
      player: { position: { x: -8, y: 0 }, radius: 0.3 },
      characters: [],
      targets: [],
      walls: [],
      bullet: null,
      previewTrail: [
        { x: -8, y: 0 },
        { x: -5, y: 1 },
      ],
      trail: [
        { x: -8, y: 0 },
        { x: -4, y: 2 },
      ],
    });

    expect(setLineDash).toHaveBeenNthCalledWith(1, [8, 6]);
    expect(setLineDash).toHaveBeenNthCalledWith(2, []);
    expect(context.stroke).toHaveBeenCalled();
    expect(strokeStyles).toContain(BOARD_PALETTE.previewTrail);
    expect(strokeStyles).toContain(BOARD_PALETTE.trail);
  });
});
