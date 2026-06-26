import { WORLD_BOUNDS } from '../models/world-bounds';
import { shotAnimationDuration } from './shot-animation';

describe('shotAnimationDuration', () => {
  it('keeps a full-width straight shot at the reference free-practice duration', () => {
    expect(
      shotAnimationDuration([
        { x: WORLD_BOUNDS.minX, y: 0 },
        { x: WORLD_BOUNDS.maxX, y: 0 },
      ]),
    ).toBe(3000);
  });

  it('shortens close hits so their visual speed matches free practice', () => {
    expect(
      shotAnimationDuration([
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBe(375);
  });
});
