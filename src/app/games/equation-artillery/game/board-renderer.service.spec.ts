import { BoardRenderer } from './board-renderer.service';
import { WORLD_BOUNDS } from '../models/world-bounds';

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
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    new BoardRenderer().draw(context, { width: 800, height: 500 }, WORLD_BOUNDS, {
      player: { position: { x: -8, y: 0 }, radius: 0.3 },
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
});
