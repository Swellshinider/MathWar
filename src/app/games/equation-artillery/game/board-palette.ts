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
  characterColors: ['#2dd4bf', '#38bdf8', '#818cf8', '#fb7185', '#f97316', '#facc15'],
  characterGlows: [
    'rgba(45, 212, 191, 0.9)',
    'rgba(56, 189, 248, 0.9)',
    'rgba(129, 140, 248, 0.9)',
    'rgba(251, 113, 133, 0.9)',
    'rgba(249, 115, 22, 0.9)',
    'rgba(250, 204, 21, 0.9)',
  ],
  activeCharacterRing: '#fff7d1',
  playerText: '#d8f7e6',
  playerGlow: 'rgba(69, 212, 131, 0.62)',
  functionText: '#fff0a6',
  functionTextBackground: 'rgba(7, 17, 31, 0.78)',
  target: '#f45b69',
  targetBorder: '#ffd3d7',
  wall: '#506b86',
  wallBorder: '#9db1c5',
  bullet: '#fff0a6',
  bulletGlow: 'rgba(255, 240, 166, 0.55)',
} as const;
