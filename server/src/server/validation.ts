import { randomBytes } from 'node:crypto';
import {
  FormulaFrenzyAnswerCommand,
  FormulaFrenzyHintCommand,
  FormulaFrenzyTypingCommand,
  GameId,
  VersionedCommand,
} from '@math-war/game-engine';

const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function createRoomCode(): string {
  const bytes = randomBytes(8);
  const characters = [...bytes].map((byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]);
  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}

export function normalizeRoomCode(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  if (/^[A-Z0-9]{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return value.trim().toUpperCase();
}

export function parsePositiveInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}.`);
  }
  return parsed;
}

export function parseBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

export function parseNullableBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null) return null;
  return parseBoundedInteger(value, label, min, max);
}

export function isVersionedCommand(value: unknown): value is VersionedCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<VersionedCommand>;
  return (
    typeof command.commandId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(command.commandId) &&
    Number.isInteger(command.expectedVersion) &&
    (command.expectedVersion ?? -1) >= 0
  );
}

export function requestedGameId(command: Pick<VersionedCommand, 'gameId'>): GameId {
  return command.gameId ?? 'equation-artillery';
}

export function isFormulaAnswerCommand(value: unknown): value is FormulaFrenzyAnswerCommand {
  if (!isVersionedCommand(value)) return false;
  return typeof (value as Partial<FormulaFrenzyAnswerCommand>).answer === 'number';
}

export function isFormulaHintCommand(value: unknown): value is FormulaFrenzyHintCommand {
  return isVersionedCommand(value);
}

export function isFormulaTypingCommand(value: unknown): value is FormulaFrenzyTypingCommand {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as FormulaFrenzyTypingCommand).input === 'string';
}
