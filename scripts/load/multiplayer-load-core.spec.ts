import { describe, expect, it } from 'vitest';
import {
  createSummary,
  createSuiteSummary,
  expandAllScenario,
  latencySummary,
  LoadStats,
  parseArgs,
  parsePostRunMetrics,
  reconnectTokenFor,
  versionedPayload,
  VersionTracker,
  type Options,
} from './multiplayer-load-core.js';

function options(): Options {
  return parseArgs([
    '--scenario',
    'formula',
    '--url',
    'http://127.0.0.1:3000',
    '--players',
    '4',
    '--matches',
    '2',
    '--duration',
    '1s',
    '--warmup-ms',
    '0',
    '--cooldown-ms',
    '0',
  ]);
}

describe('multiplayer load runner core', () => {
  it('counts commands and acknowledgement results', () => {
    const stats = new LoadStats();

    stats.recordCommand('room:create');
    stats.recordCommand('formula:answer');
    stats.recordCommand('formula:answer');
    stats.recordAck('room:create', 'ok', 10);
    stats.recordAck('formula:answer', 'wrong_answer', 15);
    stats.recordAck('formula:answer', 'stale', 20);

    expect(stats.commands).toBe(3);
    expect(stats.commandsByEvent).toEqual({ 'room:create': 1, 'formula:answer': 2 });
    expect(stats.acksByResult).toEqual({ ok: 1, wrong_answer: 1, stale: 1 });
    expect(stats.acksByEvent['formula:answer']).toEqual({ wrong_answer: 1, stale: 1 });
  });

  it('updates authoritative match version from state events', () => {
    const tracker = new VersionTracker();

    tracker.update({ version: 1, status: 'waiting', roomCode: 'AAAA-BBBB' });
    tracker.update({ version: 3, status: 'active', turnUserId: 'right' });
    tracker.update({ version: 2, status: 'active', turnUserId: 'left' });

    expect(tracker.version).toBe(3);
    expect(tracker.currentStatus).toBe('active');
    expect(tracker.currentTurnUserId).toBe('right');
    expect(tracker.currentRoomCode).toBe('AAAA-BBBB');
  });

  it('builds match:leave payloads with the latest known version', () => {
    const tracker = new VersionTracker();
    tracker.update({ version: 7 });

    const payload = versionedPayload(tracker);

    expect(payload['expectedVersion']).toBe(7);
    expect(payload['commandId']).toEqual(expect.any(String));
  });

  it('calculates latency percentiles', () => {
    expect(latencySummary([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      avg: 30,
      p50: 30,
      p95: 50,
      p99: 50,
      max: 50,
    });
  });

  it('parses post-run socket metrics', () => {
    const metrics = [
      'mathwar_socket_active 0',
      'mathwar_socket_connections_total 100',
      'mathwar_socket_disconnects_total{reason="client namespace disconnect"} 90',
      'mathwar_socket_disconnects_total{reason="transport close"} 10',
    ].join('\n');

    expect(parsePostRunMetrics(metrics)).toEqual({
      socketActive: 0,
      socketConnectionsTotal: 100,
      socketDisconnectsTotal: 100,
    });
  });

  it('creates a valid summary whose commands equal the event breakdown', () => {
    const stats = new LoadStats();
    stats.recordCommand('room:create');
    stats.recordCommand('room:join');
    stats.recordCommand('formula:start');
    stats.recordCommand('formula:typing');
    stats.recordCommand('formula:answer');
    stats.recordAck('room:create', 'ok', 4);
    stats.recordAck('room:join', 'ok', 5);
    stats.recordAck('formula:start', 'ok', 6);
    stats.recordAck('formula:answer', 'wrong_answer', 7);
    stats.formulaAnswersSent = 1;
    stats.formulaWrongRejected = 1;

    const summary = createSummary(options(), stats, 1_000, {
      socketActive: 0,
      socketConnectionsTotal: 4,
      socketDisconnectsTotal: 4,
    });

    expect(summary.commands).toBe(
      Object.values(summary.commandsByEvent).reduce((sum, count) => sum + count, 0),
    );
    expect(summary.commandsByEvent['formula:answer']).toBe(1);
    expect(summary.commandsByEvent['formula:typing']).toBe(1);
    expect(summary.latencyMs.socketCommandAck.p95).toBeGreaterThan(0);
  });

  it('uses the same guest token for reconnects', () => {
    expect(reconnectTokenFor({ token: 'guest-token' })).toBe('guest-token');
  });

  it('expands the all scenario across gameplay and reconnect runs for both games', () => {
    const expanded = expandAllScenario(
      parseArgs(['--scenario', 'all', '--players', '8', '--matches', '4', '--duration', '1s']),
    );

    expect(expanded.map((run) => `${run.scenario}:${run.game}`)).toEqual([
      'formula:formula-frenzy',
      'artillery:equation-artillery',
      'reconnect:formula-frenzy',
      'reconnect:equation-artillery',
    ]);
    expect(expanded.every((run) => run.players === 8 && run.matches === 4)).toBe(true);
  });

  it('aggregates all-scenario run summaries', () => {
    const baseOptions = options();
    const first = createSummary(baseOptions, new LoadStats(), 100, {
      socketActive: 0,
      socketConnectionsTotal: 2,
      socketDisconnectsTotal: 2,
    });
    const stats = new LoadStats();
    stats.recordCommand('match:fire');
    const second = createSummary(
      { ...baseOptions, scenario: 'artillery', game: 'equation-artillery' },
      stats,
      100,
      {
        socketActive: 0,
        socketConnectionsTotal: 2,
        socketDisconnectsTotal: 2,
      },
    );

    const suite = createSuiteSummary({ ...baseOptions, scenario: 'all' }, [first, second], 250);

    expect(suite.scenario).toBe('all');
    expect(suite.commands).toBe(1);
    expect(suite.commandsByRun['formula:formula-frenzy']).toBe(0);
    expect(suite.commandsByRun['artillery:equation-artillery']).toBe(1);
  });
});
