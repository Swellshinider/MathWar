export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export const WORLD_BOUNDS: WorldBounds = {
  minX: -16,
  maxX: 16,
  minY: -10,
  maxY: 10,
};
