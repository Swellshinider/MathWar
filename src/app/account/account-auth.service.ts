import { Injectable, inject, signal } from '@angular/core';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';

export interface AccountUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

interface AccountSession {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly user: AccountUser;
}

interface UsernameAvailability {
  readonly username: string;
  readonly available: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountAuthService {
  private readonly config = inject(MULTIPLAYER_CONFIG);
  private accessToken: string | null = null;

  readonly ready = signal(false);
  readonly user = signal<AccountUser | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  token(): string | null {
    return this.accessToken;
  }

  avatarUrl(): string | null {
    const url = this.user()?.avatarUrl;
    return url ? new URL(url, this.config.serverUrl).toString() : null;
  }

  async register(username: string, password: string, displayName: string): Promise<boolean> {
    return this.authenticate('/api/account/register', { username, password, displayName });
  }

  async login(username: string, password: string): Promise<boolean> {
    return this.authenticate('/api/account/login', { username, password });
  }

  async checkUsernameAvailability(username: string): Promise<UsernameAvailability | null> {
    try {
      const url = new URL('/api/account/username-availability', this.config.serverUrl);
      url.searchParams.set('username', username);
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        this.error.set(readMessage(payload, 'Could not check username availability.'));
        return null;
      }
      this.error.set(null);
      return payload as UsernameAvailability;
    } catch {
      this.error.set('Could not reach the account server.');
      return null;
    }
  }

  async refresh(): Promise<boolean> {
    try {
      const response = await fetch(new URL('/api/account/refresh', this.config.serverUrl), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        this.clearSession();
        return false;
      }
      this.setSession((await response.json()) as AccountSession);
      return true;
    } catch {
      this.clearSession();
      return false;
    } finally {
      this.ready.set(true);
    }
  }

  async logout(): Promise<void> {
    await fetch(new URL('/api/account/logout', this.config.serverUrl), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
    this.clearSession();
  }

  async updateProfile(displayName: string): Promise<boolean> {
    const user = await this.authorizedJson<AccountUser>('/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
    if (!user) return false;
    this.user.set(user);
    this.error.set(null);
    return true;
  }

  async updateAvatar(dataUrl: string): Promise<boolean> {
    const user = await this.authorizedJson<AccountUser>('/api/account/avatar', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    });
    if (!user) return false;
    this.user.set(user);
    this.error.set(null);
    return true;
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.authorizedJson<AccountUser>('/api/account/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!user) return false;
    this.user.set(user);
    this.accessToken = null;
    this.error.set(null);
    return true;
  }

  private async authenticate(path: string, body: object): Promise<boolean> {
    try {
      const response = await fetch(new URL(path, this.config.serverUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        this.error.set(readMessage(payload, 'Could not sign in.'));
        return false;
      }
      this.setSession(payload as AccountSession);
      this.error.set(null);
      return true;
    } catch {
      this.error.set('Could not reach the account server.');
      return false;
    } finally {
      this.ready.set(true);
    }
  }

  private async authorizedJson<T>(
    path: string,
    init: Omit<RequestInit, 'headers' | 'credentials'>,
    retry = true,
  ): Promise<T | null> {
    if (!this.accessToken && !(await this.refresh())) return null;
    const response = await fetch(new URL(path, this.config.serverUrl), {
      ...init,
      credentials: 'include',
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
    });
    if (response.status === 401 && retry && (await this.refresh())) {
      return this.authorizedJson<T>(path, init, false);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      this.error.set(readMessage(payload, 'The account request failed.'));
      return null;
    }
    return payload as T;
  }

  private setSession(session: AccountSession): void {
    this.accessToken = session.accessToken;
    this.user.set(session.user);
  }

  private clearSession(): void {
    this.accessToken = null;
    this.user.set(null);
  }
}

function readMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : fallback;
}
