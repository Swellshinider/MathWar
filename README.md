# Math War

Math War is an Angular 22 browser prototype in which a player fires a bullet along a mathematical curve to destroy targets on a coordinate plane.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Install and run

```bash
npm install
npm start
```

Open the local URL printed by the Angular development server.

## Development commands

```bash
npm test
npm run build
```

`npm test` runs the Vitest unit suite. `npm run build` creates an optimized production build in `dist/`.

## Controls and equations

Enter a function in the `f(x)` field and select **Fire**. The Fire control remains disabled until the shot ends. Destroy all three red targets to expose **New Round**.

Equations may contain numbers, `x`, `pi`, `e`, parentheses, `+`, `-`, `*`, `/`, `^`, and these one-argument functions:

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `log`, `ln`, and `exp`.

Angles use radians. Common Unicode multiplication, division, minus, and pi characters are normalized. Implicit multiplication is supported, including `2x`, `xx`, `x2`, `x(x+1)`, `(x+1)(x-1)`, and `sin(x)cos(x)`.

The shot is anchored to the player's position. For horizontal distance `dx` from the player, its height is:

```text
playerY + f(dx) - f(0)
```

This means every valid curve begins at the player even when `f(0)` is not zero.

## Prototype limitations

- Rounds are local and are not persisted.
- The player and targets are randomly placed on integer coordinates.
- Equations are limited to 180 normalized characters and the documented syntax.
- The game has no scoring, sound, touch-specific controls, or multiplayer support.
