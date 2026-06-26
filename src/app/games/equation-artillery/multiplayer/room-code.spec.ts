import { formatRoomCode } from './room-code';

describe('formatRoomCode', () => {
  it('formats raw room codes', () => {
    expect(formatRoomCode('abcd efgh')).toBe('ABCD-EFGH');
  });

  it('extracts room codes from invite links', () => {
    expect(
      formatRoomCode(
        'https://math-war.example/games/equation-artillery/multiplayer?room=07ES-BZEP',
      ),
    ).toBe('07ES-BZEP');
  });
});
