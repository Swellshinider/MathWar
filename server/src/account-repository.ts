import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { EncryptedEmail } from './account-auth.js';

export interface AccountRecord {
  readonly id: string;
  readonly emailLookupHash: string;
  readonly encryptedEmail: EncryptedEmail;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly avatarMimeType: string | null;
  readonly avatarUpdatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccountAvatar {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly updatedAt: string;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly accountId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface CreateAccountInput {
  readonly emailLookupHash: string;
  readonly encryptedEmail: EncryptedEmail;
  readonly passwordHash: string;
  readonly displayName: string;
}

export interface AccountRepository {
  initialize(): Promise<void>;
  createAccount(input: CreateAccountInput): Promise<AccountRecord>;
  findAccountById(id: string): Promise<AccountRecord | null>;
  findAccountByEmailLookupHash(emailLookupHash: string): Promise<AccountRecord | null>;
  updateProfile(id: string, displayName: string): Promise<AccountRecord | null>;
  updatePasswordAndEmail(
    id: string,
    passwordHash: string,
    encryptedEmail: EncryptedEmail,
  ): Promise<AccountRecord | null>;
  setAvatar(id: string, avatar: { bytes: Buffer; mimeType: string }): Promise<AccountRecord | null>;
  getAvatar(id: string): Promise<AccountAvatar | null>;
  createRefreshToken(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string, replacedByTokenId?: string): Promise<void>;
  revokeAccountRefreshTokens(accountId: string): Promise<void>;
  close(): Promise<void>;
}

const ACCOUNT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  email_lookup_hash text NOT NULL UNIQUE,
  email_ciphertext text NOT NULL,
  email_iv text NOT NULL,
  email_tag text NOT NULL,
  email_salt text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar_bytes bytea,
  avatar_mime_type text,
  avatar_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_account_id_idx ON refresh_tokens(account_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);
`;

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountRecord & { avatarBytes?: Buffer }>();
  private readonly accountIdsByEmailLookupHash = new Map<string, string>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly refreshTokenIdsByHash = new Map<string, string>();

  async initialize(): Promise<void> {}

  async createAccount(input: CreateAccountInput): Promise<AccountRecord> {
    if (this.accountIdsByEmailLookupHash.has(input.emailLookupHash)) {
      throw new Error('An account already exists for this email address.');
    }
    const now = new Date().toISOString();
    const account: AccountRecord = {
      id: randomUUID(),
      emailLookupHash: input.emailLookupHash,
      encryptedEmail: input.encryptedEmail,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      avatarMimeType: null,
      avatarUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.id, account);
    this.accountIdsByEmailLookupHash.set(account.emailLookupHash, account.id);
    return structuredClone(account);
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    return this.cloneAccount(this.accounts.get(id) ?? null);
  }

  async findAccountByEmailLookupHash(emailLookupHash: string): Promise<AccountRecord | null> {
    const id = this.accountIdsByEmailLookupHash.get(emailLookupHash);
    return id ? this.findAccountById(id) : null;
  }

  async updateProfile(id: string, displayName: string): Promise<AccountRecord | null> {
    const account = this.accounts.get(id);
    if (!account) return null;
    const next = { ...account, displayName, updatedAt: new Date().toISOString() };
    this.accounts.set(id, next);
    return this.cloneAccount(next);
  }

  async updatePasswordAndEmail(
    id: string,
    passwordHash: string,
    encryptedEmail: EncryptedEmail,
  ): Promise<AccountRecord | null> {
    const account = this.accounts.get(id);
    if (!account) return null;
    const next = { ...account, passwordHash, encryptedEmail, updatedAt: new Date().toISOString() };
    this.accounts.set(id, next);
    return this.cloneAccount(next);
  }

  async setAvatar(
    id: string,
    avatar: { bytes: Buffer; mimeType: string },
  ): Promise<AccountRecord | null> {
    const account = this.accounts.get(id);
    if (!account) return null;
    const now = new Date().toISOString();
    const next = {
      ...account,
      avatarBytes: Buffer.from(avatar.bytes),
      avatarMimeType: avatar.mimeType,
      avatarUpdatedAt: now,
      updatedAt: now,
    };
    this.accounts.set(id, next);
    return this.cloneAccount(next);
  }

  async getAvatar(id: string): Promise<AccountAvatar | null> {
    const account = this.accounts.get(id);
    if (!account?.avatarBytes || !account.avatarMimeType || !account.avatarUpdatedAt) return null;
    return {
      bytes: Buffer.from(account.avatarBytes),
      mimeType: account.avatarMimeType,
      updatedAt: account.avatarUpdatedAt,
    };
  }

  async createRefreshToken(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt.toISOString(),
      revokedAt: null,
    };
    this.refreshTokens.set(record.id, record);
    this.refreshTokenIdsByHash.set(record.tokenHash, record.id);
    return structuredClone(record);
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const id = this.refreshTokenIdsByHash.get(tokenHash);
    const record = id ? this.refreshTokens.get(id) : null;
    return record ? structuredClone(record) : null;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    const record = this.refreshTokens.get(id);
    if (!record || record.revokedAt) return;
    this.refreshTokens.set(id, { ...record, revokedAt: new Date().toISOString() });
  }

  async revokeAccountRefreshTokens(accountId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const [id, record] of this.refreshTokens) {
      if (record.accountId === accountId && !record.revokedAt) {
        this.refreshTokens.set(id, { ...record, revokedAt: now });
      }
    }
  }

  async close(): Promise<void> {}

  private cloneAccount(
    account: (AccountRecord & { avatarBytes?: Buffer }) | null,
  ): AccountRecord | null {
    if (!account) return null;
    const { avatarBytes: _avatarBytes, ...publicAccount } = account;
    return structuredClone(publicAccount);
  }
}

export class PostgresAccountRepository implements AccountRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(urlOrPool: string | Pool) {
    this.pool =
      typeof urlOrPool === 'string' ? new Pool({ connectionString: urlOrPool }) : urlOrPool;
    this.ownsPool = typeof urlOrPool === 'string';
  }

  async initialize(): Promise<void> {
    await this.pool.query(ACCOUNT_SCHEMA_SQL);
  }

  async createAccount(input: CreateAccountInput): Promise<AccountRecord> {
    const result = await this.pool.query(
      `INSERT INTO accounts (
        id,
        email_lookup_hash,
        email_ciphertext,
        email_iv,
        email_tag,
        email_salt,
        password_hash,
        display_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        randomUUID(),
        input.emailLookupHash,
        input.encryptedEmail.ciphertext,
        input.encryptedEmail.iv,
        input.encryptedEmail.tag,
        input.encryptedEmail.salt,
        input.passwordHash,
        input.displayName,
      ],
    );
    return mapAccount(result.rows[0]);
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    const result = await this.pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return result.rowCount ? mapAccount(result.rows[0]) : null;
  }

  async findAccountByEmailLookupHash(emailLookupHash: string): Promise<AccountRecord | null> {
    const result = await this.pool.query('SELECT * FROM accounts WHERE email_lookup_hash = $1', [
      emailLookupHash,
    ]);
    return result.rowCount ? mapAccount(result.rows[0]) : null;
  }

  async updateProfile(id: string, displayName: string): Promise<AccountRecord | null> {
    const result = await this.pool.query(
      `UPDATE accounts
      SET display_name = $2, updated_at = now()
      WHERE id = $1
      RETURNING *`,
      [id, displayName],
    );
    return result.rowCount ? mapAccount(result.rows[0]) : null;
  }

  async updatePasswordAndEmail(
    id: string,
    passwordHash: string,
    encryptedEmail: EncryptedEmail,
  ): Promise<AccountRecord | null> {
    const result = await this.pool.query(
      `UPDATE accounts
      SET
        password_hash = $2,
        email_ciphertext = $3,
        email_iv = $4,
        email_tag = $5,
        email_salt = $6,
        updated_at = now()
      WHERE id = $1
      RETURNING *`,
      [
        id,
        passwordHash,
        encryptedEmail.ciphertext,
        encryptedEmail.iv,
        encryptedEmail.tag,
        encryptedEmail.salt,
      ],
    );
    return result.rowCount ? mapAccount(result.rows[0]) : null;
  }

  async setAvatar(
    id: string,
    avatar: { bytes: Buffer; mimeType: string },
  ): Promise<AccountRecord | null> {
    const result = await this.pool.query(
      `UPDATE accounts
      SET avatar_bytes = $2, avatar_mime_type = $3, avatar_updated_at = now(), updated_at = now()
      WHERE id = $1
      RETURNING *`,
      [id, avatar.bytes, avatar.mimeType],
    );
    return result.rowCount ? mapAccount(result.rows[0]) : null;
  }

  async getAvatar(id: string): Promise<AccountAvatar | null> {
    const result = await this.pool.query(
      `SELECT avatar_bytes, avatar_mime_type, avatar_updated_at
      FROM accounts
      WHERE id = $1 AND avatar_bytes IS NOT NULL`,
      [id],
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      bytes: row.avatar_bytes,
      mimeType: row.avatar_mime_type,
      updatedAt: row.avatar_updated_at.toISOString(),
    };
  }

  async createRefreshToken(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const result = await this.pool.query(
      `INSERT INTO refresh_tokens (id, account_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [randomUUID(), input.accountId, input.tokenHash, input.expiresAt],
    );
    return mapRefreshToken(result.rows[0]);
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const result = await this.pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [
      tokenHash,
    ]);
    return result.rowCount ? mapRefreshToken(result.rows[0]) : null;
  }

  async revokeRefreshToken(id: string, replacedByTokenId?: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, now()), replaced_by_token_id = COALESCE($2, replaced_by_token_id)
      WHERE id = $1`,
      [id, replacedByTokenId ?? null],
    );
  }

  async revokeAccountRefreshTokens(accountId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId],
    );
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}

function mapAccount(row: Record<string, any>): AccountRecord {
  return {
    id: row['id'],
    emailLookupHash: row['email_lookup_hash'],
    encryptedEmail: {
      ciphertext: row['email_ciphertext'],
      iv: row['email_iv'],
      tag: row['email_tag'],
      salt: row['email_salt'],
    },
    passwordHash: row['password_hash'],
    displayName: row['display_name'],
    avatarMimeType: row['avatar_mime_type'] ?? null,
    avatarUpdatedAt: row['avatar_updated_at']?.toISOString() ?? null,
    createdAt: row['created_at'].toISOString(),
    updatedAt: row['updated_at'].toISOString(),
  };
}

function mapRefreshToken(row: Record<string, any>): RefreshTokenRecord {
  return {
    id: row['id'],
    accountId: row['account_id'],
    tokenHash: row['token_hash'],
    expiresAt: row['expires_at'].toISOString(),
    revokedAt: row['revoked_at']?.toISOString() ?? null,
  };
}
