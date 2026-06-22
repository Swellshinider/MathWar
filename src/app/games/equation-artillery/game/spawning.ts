import { Player } from '../models/player';
import { Target } from '../models/target';
import { targetsOverlap } from './collision';

export interface RoundEntities {
  readonly player: Player;
  readonly targets: readonly Target[];
}

const integerBetween = (random: () => number, minimum: number, maximum: number): number =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

export function spawnRound(random: () => number = Math.random): RoundEntities {
  const player: Player = {
    position: { x: integerBetween(random, -10, -6), y: integerBetween(random, -5, 5) },
    radius: 0.32,
  };
  const targets: Target[] = [];

  for (let attempts = 0; targets.length < 3 && attempts < 500; attempts += 1) {
    const candidate: Target = {
      id: targets.length + 1,
      center: { x: integerBetween(random, 3, 10), y: integerBetween(random, -5, 5) },
      width: 1,
      height: 1,
    };
    if (!targets.some((target) => targetsOverlap(target, candidate, 0.2))) {
      targets.push(candidate);
    }
  }

  if (targets.length !== 3) {
    throw new Error('Unable to place three targets without overlap.');
  }
  return { player, targets };
}
