import { compileExpression, ExpressionError } from './expression';

const DOMAIN_MIN = -16;
const DOMAIN_MAX = 16;
const SAMPLE_COUNT = 121;
const VIEWBOX_WIDTH = 240;
const VIEWBOX_HEIGHT = 100;
const PADDING = 8;
const CONSTANT_TOLERANCE = 1e-9;
const DISCONTINUITY_THRESHOLD = VIEWBOX_HEIGHT * 0.6;
const PREVIEW_CACHE_LIMIT = 64;

interface PreviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface FunctionPreview {
  readonly path: string | null;
  readonly available: boolean;
}

const previewCache = new Map<string, FunctionPreview>();

function cachePreview(equation: string, preview: FunctionPreview): FunctionPreview {
  previewCache.delete(equation);
  previewCache.set(equation, preview);
  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
  return preview;
}

function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function buildFunctionPreview(equation: string): FunctionPreview {
  const cached = previewCache.get(equation);
  if (cached) {
    previewCache.delete(equation);
    previewCache.set(equation, cached);
    return cached;
  }
  let expression;
  try {
    expression = compileExpression(equation);
  } catch (error) {
    if (error instanceof ExpressionError) {
      return cachePreview(equation, { path: null, available: false });
    }
    throw error;
  }

  const samples: (PreviewPoint | null)[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const x = DOMAIN_MIN + (index / (SAMPLE_COUNT - 1)) * (DOMAIN_MAX - DOMAIN_MIN);
    try {
      samples.push({ x, y: expression.evaluate(x) });
    } catch (error) {
      if (!(error instanceof ExpressionError)) throw error;
      samples.push(null);
    }
  }

  const validSamples = samples.filter((sample): sample is PreviewPoint => sample !== null);
  if (validSamples.length < 2) {
    return cachePreview(equation, { path: null, available: false });
  }

  const values = validSamples.map((sample) => sample.y);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const range = maxY - minY;
  const usableWidth = VIEWBOX_WIDTH - PADDING * 2;
  const usableHeight = VIEWBOX_HEIGHT - PADDING * 2;
  const toViewPoint = (sample: PreviewPoint): PreviewPoint => ({
    x: PADDING + ((sample.x - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * usableWidth,
    y:
      range < CONSTANT_TOLERANCE
        ? VIEWBOX_HEIGHT / 2
        : PADDING + ((maxY - sample.y) / range) * usableHeight,
  });

  const commands: string[] = [];
  let previous: PreviewPoint | null = null;
  samples.forEach((sample) => {
    if (!sample) {
      previous = null;
      return;
    }
    const point = toViewPoint(sample);
    const startsSegment = !previous || Math.abs(point.y - previous.y) > DISCONTINUITY_THRESHOLD;
    commands.push(
      `${startsSegment ? 'M' : 'L'}${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`,
    );
    previous = point;
  });

  return cachePreview(equation, {
    path: commands.join(' '),
    available: commands.some((command) => command.startsWith('L')),
  });
}
