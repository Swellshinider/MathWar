import { timingSafeEqual } from 'node:crypto';
import { Socket } from 'socket.io';

interface RateBucket {
  count: number;
  resetAt: number;
}

export function socketAddress(socket: Socket): string {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
}

export function createFixedWindowLimiter(windowMs: number) {
  const buckets = new Map<string, RateBucket>();
  return (key: string, limit: number): boolean => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > limit) return false;
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function isMetricsRequestAuthorized(authorization: string | undefined): boolean {
  const token = process.env['METRICS_TOKEN'];
  const requiresToken = process.env['NODE_ENV'] === 'production' || !!token;
  if (!requiresToken) return true;
  if (!token || !authorization?.startsWith('Bearer ')) return false;
  return timingSafeStringEqual(authorization.slice('Bearer '.length), token);
}

export function cspConnectSrc(allowedOrigin: string): string[] {
  if (allowedOrigin === '*') return ["'self'", 'http:', 'https:', 'ws:', 'wss:'];
  const sources = new Set(["'self'", allowedOrigin]);
  try {
    const origin = new URL(allowedOrigin);
    sources.add(`${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`);
  } catch {}
  return [...sources];
}

export function canonicalOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function seoPublicPaths(): readonly string[] {
  return [
    '/',
    '/about',
    '/games/equation-artillery',
    '/games/formula-frenzy',
    '/leaderboard/formula-frenzy',
  ];
}

export function createRobotsTxt(siteOrigin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /socket.io/',
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function createSitemapXml(siteOrigin: string): string {
  const urls = seoPublicPaths()
    .map((path) => {
      const loc = path === '/' ? siteOrigin : `${siteOrigin}${path}`;
      return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
