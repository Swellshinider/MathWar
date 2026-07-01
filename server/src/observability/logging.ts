import { FastifyBaseLogger } from 'fastify';
import { GameId, MatchStatus } from '@math-war/game-engine';
import { SocketCommand } from './metrics.js';

export interface CommandLogFields {
  readonly command: SocketCommand | 'reconnect' | 'cleanup';
  readonly outcome: 'accepted' | 'rejected' | 'success' | 'miss' | 'error';
  readonly code?: string;
  readonly gameId?: GameId;
  readonly matchStatus?: MatchStatus;
  readonly durationMs?: number;
}

export function commandLogFields(fields: CommandLogFields): Record<string, unknown> {
  return {
    event: 'socket_command',
    command: fields.command,
    outcome: fields.outcome,
    code: fields.code,
    gameId: fields.gameId,
    matchStatus: fields.matchStatus,
    durationMs:
      fields.durationMs === undefined ? undefined : Math.round(fields.durationMs * 100) / 100,
  };
}

export function logCommand(logger: FastifyBaseLogger, fields: CommandLogFields): void {
  const safeFields = commandLogFields(fields);
  if (fields.outcome === 'accepted' || fields.outcome === 'success') {
    logger.info(safeFields);
    return;
  }
  if (fields.outcome === 'error') {
    logger.error(safeFields);
    return;
  }
  logger.warn(safeFields);
}
