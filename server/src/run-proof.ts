import { createHash, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { LeaderboardDifficulty, LeaderboardScoreInput } from './leaderboard-repository.js';

const RUN_PROOF_ISSUER = 'math-war';
const RUN_PROOF_AUDIENCE = 'math-war-run-proof';
const RUN_PROOF_DURATION_SECONDS = 10 * 60;

export type RunProofKind = 'formula-frenzy' | 'equation-artillery-cpu-win';

export interface FormulaFrenzyCompletionProof {
  readonly kind: 'formula-frenzy';
  readonly accountId: string | null;
  readonly runId: string;
  readonly difficulty: LeaderboardDifficulty;
  readonly score: number;
  readonly level: number;
  readonly averageTimeMs: number | null;
  readonly bestStreak: number;
  readonly totalCorrect: number;
}

export interface EquationArtilleryCpuWinProof {
  readonly kind: 'equation-artillery-cpu-win';
  readonly accountId: string | null;
  readonly runId: string;
  readonly cpuLevel: number;
}

export type RunCompletionProof = FormulaFrenzyCompletionProof | EquationArtilleryCpuWinProof;

export function runProofId(): string {
  return randomUUID();
}

export async function issueRunCompletionToken(
  secret: string,
  proof: RunCompletionProof,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + RUN_PROOF_DURATION_SECONDS;
  return new SignJWT({
    kind: proof.kind,
    accountId: proof.accountId,
    runId: proof.runId,
    difficulty: 'difficulty' in proof ? proof.difficulty : undefined,
    score: 'score' in proof ? proof.score : undefined,
    level: 'level' in proof ? proof.level : undefined,
    averageTimeMs: 'averageTimeMs' in proof ? proof.averageTimeMs : undefined,
    bestStreak: 'bestStreak' in proof ? proof.bestStreak : undefined,
    totalCorrect: 'totalCorrect' in proof ? proof.totalCorrect : undefined,
    cpuLevel: 'cpuLevel' in proof ? proof.cpuLevel : undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(RUN_PROOF_ISSUER)
    .setAudience(RUN_PROOF_AUDIENCE)
    .setJti(runProofId())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(runProofKey(secret));
}

export async function verifyRunCompletionToken(
  secret: string,
  token: string,
): Promise<RunCompletionProof> {
  const { payload } = await jwtVerify(token, runProofKey(secret), {
    algorithms: ['HS256'],
    issuer: RUN_PROOF_ISSUER,
    audience: RUN_PROOF_AUDIENCE,
  });
  if (payload['kind'] === 'formula-frenzy') {
    const proof = {
      kind: 'formula-frenzy',
      accountId: payload['accountId'] === null ? null : stringClaim(payload['accountId']),
      runId: stringClaim(payload['runId']),
      difficulty: difficultyClaim(payload['difficulty']),
      score: numberClaim(payload['score']),
      level: numberClaim(payload['level']),
      averageTimeMs:
        payload['averageTimeMs'] === null ? null : numberClaim(payload['averageTimeMs']),
      bestStreak: numberClaim(payload['bestStreak']),
      totalCorrect: numberClaim(payload['totalCorrect']),
    } satisfies FormulaFrenzyCompletionProof;
    return proof;
  }
  if (payload['kind'] === 'equation-artillery-cpu-win') {
    return {
      kind: 'equation-artillery-cpu-win',
      accountId: payload['accountId'] === null ? null : stringClaim(payload['accountId']),
      runId: stringClaim(payload['runId']),
      cpuLevel: numberClaim(payload['cpuLevel']),
    };
  }
  throw new Error('Run completion token is invalid.');
}

export function leaderboardInputFromProof(
  proof: FormulaFrenzyCompletionProof,
  accountId: string,
  username: string,
): LeaderboardScoreInput {
  return {
    gameId: 'formula-frenzy',
    accountId,
    username,
    difficulty: proof.difficulty,
    score: proof.score,
    level: proof.level,
    averageTimeMs: proof.averageTimeMs,
    bestStreak: proof.bestStreak,
    totalCorrect: proof.totalCorrect,
  };
}

function runProofKey(secret: string): Uint8Array {
  return createHash('sha256').update('math-war:run-proof:v1').update(secret).digest();
}

function stringClaim(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Run completion token is invalid.');
  return value;
}

function numberClaim(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Run completion token is invalid.');
  }
  return value;
}

function difficultyClaim(value: unknown): LeaderboardDifficulty {
  if (value !== 'normal' && value !== 'hardcore') {
    throw new Error('Run completion token is invalid.');
  }
  return value;
}
