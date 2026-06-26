import { CharacterState, PlayerState, ShotHistoryEntry } from '@math-war/game-engine';
import { EquationHistoryMessage } from './equation-history.component';

type HistoryEntry = Pick<ShotHistoryEntry, 'equation' | 'shooterUserId'> &
  Partial<Pick<ShotHistoryEntry, 'commandId' | 'shooterCharacterId'>>;

export interface EquationHistoryMessageOptions {
  readonly entries: readonly HistoryEntry[];
  readonly players: readonly PlayerState[];
  readonly characters: readonly CharacterState[];
  readonly currentUserId: string | null;
  readonly fallbackIdPrefix: string;
  readonly fallbackSenderName: string;
}

export function mapEquationHistoryMessages(
  options: EquationHistoryMessageOptions,
): readonly EquationHistoryMessage[] {
  return options.entries.map((entry, index) => {
    const player = options.players.find((candidate) => candidate.userId === entry.shooterUserId);
    const character =
      typeof entry.shooterCharacterId === 'number'
        ? options.characters.find((candidate) => candidate.id === entry.shooterCharacterId)
        : null;
    return {
      id: entry.commandId ?? `${options.fallbackIdPrefix}-${index}`,
      equation: entry.equation,
      senderName: player?.displayName ?? options.fallbackSenderName,
      soldierName: character?.displayName ?? null,
      mine: entry.shooterUserId === options.currentUserId,
    };
  });
}
