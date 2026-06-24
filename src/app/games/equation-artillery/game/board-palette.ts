/**
 * Color palette for the Equation Artillery board. Mirrors the CSS design tokens in
 * `src/styles.scss` so the canvas and the surrounding UI stay visually in sync. The
 * glow tints are applied via `shadowColor`/`shadowBlur` in the renderer.
 */
export const BOARD_PALETTE = {
  background: '#07111f',
  gridMinor: 'rgba(120, 145, 173, 0.1)',
  gridAxis: '#7891ad',
  gridLabel: '#8295aa',
  trail: '#f8c15c',
  trailGlow: 'rgba(248, 193, 92, 0.45)',
  player: '#45d483',
  target: '#f45b69',
  targetBorder: '#ffd3d7',
  wall: '#506b86',
  wallBorder: '#9db1c5',
  bullet: '#fff0a6',
  bulletGlow: 'rgba(255, 240, 166, 0.55)',
} as const;
