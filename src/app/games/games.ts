import { GameDefinition } from './game-definition';

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'equation-artillery',
    eyebrow: 'Functions and graphs',
    title: 'Equation Artillery',
    summary: 'Shape a mathematical curve to guide each shot through every target.',
    image: 'images/equation-artillery.png',
    route: '/games/equation-artillery',
  },
  {
    id: 'formula-frenzy',
    eyebrow: 'Arithmetic sprint',
    title: 'Formula Frenzy',
    summary: 'Solve fast. Keep up as the formulas get harder.',
    image: 'images/formula-frenzy.png',
    route: '/games/formula-frenzy',
  },
  {
    id: 'math-cross',
    eyebrow: 'Equation crossword',
    title: 'Math Cross',
    summary: 'Fill number and operator blanks so every crossed equation works.',
    image: 'images/math-cross.png',
    route: '/games/math-cross',
  },
];
