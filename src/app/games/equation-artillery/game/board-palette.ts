/**
 * Color palette for the Equation Artillery board. Mirrors the CSS design tokens in
 * `src/styles.scss` so the canvas and the surrounding UI stay visually in sync. The
 * glow tints are applied via `shadowColor`/`shadowBlur` in the renderer.
 */
export const BOARD_PALETTE = {
  background: '#07151c',
  gridMinor: 'rgba(126, 168, 174, 0.12)',
  gridAxis: '#7ea8ae',
  gridLabel: '#91aaad',
  trail: '#f2b84b',
  trailGlow: 'rgba(242, 184, 75, 0.42)',
  previewTrail: 'rgba(242, 184, 75, 0.65)',
  player: '#55d49a',
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
  activePlayerText: '#ff8994',
  playerGlow: 'rgba(69, 212, 131, 0.62)',
  functionText: '#fff0a6',
  functionTextBackground: 'rgba(7, 17, 31, 0.78)',
  target: '#ef5b63',
  targetBorder: '#ffd3d7',
  wall: '#506b86',
  wallBorder: '#9db1c5',
  bullet: '#fff0a6',
  bulletGlow: 'rgba(255, 240, 166, 0.55)',
} as const;
