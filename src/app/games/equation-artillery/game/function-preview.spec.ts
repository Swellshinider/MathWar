import { buildFunctionPreview } from './function-preview';

describe('function preview', () => {
  it('builds an auto-fitted path for a valid function', () => {
    const preview = buildFunctionPreview('x^2');

    expect(preview.available).toBe(true);
    expect(preview.path).toMatch(/^M8 92 L/);
    expect(preview.path).toContain('232 8');
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
