import { buildFunctionPreview } from './function-preview';

function pathCoordinates(path: string | null): readonly [number, number][] {
  return (
    path
      ?.split(/[ML]/)
      .filter(Boolean)
      .map((command) => {
        const [x, y] = command.trim().split(' ').map(Number);
        return [x, y] as const;
      }) ?? []
  );
}

describe('function preview', () => {
  it('builds an auto-fitted path for a valid function', () => {
    const preview = buildFunctionPreview('x^2');

    expect(preview.available).toBe(true);
    expect(preview.path).toMatch(/^M8 8 L/);
    expect(preview.path).toContain('120 92');
    expect(preview.path).toContain('232 8');
  });

  it('previews sigmoid functions across a centered domain', () => {
    const coordinates = pathCoordinates(buildFunctionPreview('1/(1 + (e^-x))').path);
    const first = coordinates[0];
    const middle = coordinates[Math.floor(coordinates.length / 2)];
    const last = coordinates.at(-1);

    expect(first).toEqual([8, 92]);
    expect(middle).toEqual([120, 50]);
    expect(last).toEqual([232, 8]);
  });

  it('centers constant functions', () => {
    const preview = buildFunctionPreview('5');

    expect(preview.available).toBe(true);
    expect(preview.path).toMatch(/^M8 50 L/);
    expect(preview.path).toContain('232 50');
  });

  it('starts a new segment when evaluation fails within the domain', () => {
    const preview = buildFunctionPreview('1/(x-1)');

    expect(preview.available).toBe(true);
    expect(preview.path?.match(/M/g)).toHaveLength(2);
  });

  it('does not expose a path for incomplete or invalid expressions', () => {
    expect(buildFunctionPreview('x+(')).toEqual({ path: null, available: false });
    expect(buildFunctionPreview('')).toEqual({ path: null, available: false });
  });
});
