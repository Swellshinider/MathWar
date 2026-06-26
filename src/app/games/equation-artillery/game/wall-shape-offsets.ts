import { Point } from '../models/point';
import { WallShape } from '../models/wall';

function centeredOffset(index: number, count: number, pieceSize: number): number {
  return (index - (count - 1) / 2) * pieceSize;
}

export function buildWallShapeOffsets(
  shape: WallShape,
  units: number,
  pieceSize: number,
): readonly Point[] {
  if (shape === 'vertical') {
    return Array.from({ length: units }, (_, row) => ({
      x: 0,
      y: centeredOffset(row, units, pieceSize),
    }));
  }

  if (shape === 'square') {
    return Array.from({ length: units * units }, (_, index) => ({
      x: centeredOffset(index % units, units, pieceSize),
      y: centeredOffset(Math.floor(index / units), units, pieceSize),
    }));
  }

  if (shape === 'circle') {
    const radius = (units - 1) / 2;
    const points: Point[] = [];
    for (let row = 0; row < units; row += 1) {
      for (let column = 0; column < units; column += 1) {
        const x = column - radius;
        const y = row - radius;
        if (x * x + y * y <= radius * radius) {
          points.push({ x: x * pieceSize, y: y * pieceSize });
        }
      }
    }
    return points;
  }

  const points: Point[] = [];
  for (let row = 0; row < units; row += 1) {
    const width = row + 1;
    for (let column = 0; column < width; column += 1) {
      points.push({
        x: centeredOffset(column, width, pieceSize),
        y: centeredOffset(row, units, pieceSize),
      });
    }
  }
  return points;
}
