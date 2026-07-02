import { Injectable, inject, signal } from '@angular/core';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';

export interface MultiplayerGuestSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
  };
}

const STORAGE_KEY = 'math-war-multiplayer-session';
const DISPLAY_NAME_STORAGE_KEY = 'math-war-multiplayer-display-name';

@Injectable({ providedIn: 'root' })
export class MultiplayerAuthService {
  private readonly config = inject(MULTIPLAYER_CONFIG);
  readonly session = signal<MultiplayerGuestSession | null>(this.readStoredSession());
  readonly storedDisplayName = signal(this.readStoredDisplayName());
  readonly ready = signal(true);
  readonly error = signal<string | null>(null);

  async signIn(displayName: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(new URL('/api/auth/guest', this.config.serverUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
    } catch {
      this.error.set('Could not reach the multiplayer server.');
      return;
    }
    const body = (await response.json().catch(() => null)) as
      | MultiplayerGuestSession
      | { message?: string }
      | null;
    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'Could not start a guest session.';
      this.error.set(message);
      return;
    }
    const session = body as MultiplayerGuestSession;
    this.session.set(session);
    this.writeStoredSession(session);
    this.writeStoredDisplayName(session.user.displayName);
    this.error.set(null);
  }

  signOut(): void {
    this.session.set(null);
    this.error.set(null);
    this.storage?.removeItem(STORAGE_KEY);
  }

  clearInvalidSession(): void {
    this.session.set(null);
    this.storage?.removeItem(STORAGE_KEY);
  }

  private get storage(): Storage | null {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  }

  private readStoredSession(): MultiplayerGuestSession | null {
    const rawValue = this.storage?.getItem(STORAGE_KEY);
    if (!rawValue) return null;
    try {
      const session = JSON.parse(rawValue) as Partial<MultiplayerGuestSession>;
      if (
        typeof session.token === 'string' &&
        typeof session.expiresAt === 'string' &&
        typeof session.user?.id === 'string' &&
        typeof session.user?.displayName === 'string' &&
        !this.isExpired(session.expiresAt)
      ) {
        return {
          token: session.token,
          expiresAt: session.expiresAt,
          user: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
        };
      }
    } catch {}
    this.storage?.removeItem(STORAGE_KEY);
    return null;
  }

  private writeStoredSession(session: MultiplayerGuestSession): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  private readStoredDisplayName(): string {
    return this.storage?.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '';
  }

  private writeStoredDisplayName(displayName: string): void {
    this.storage?.setItem(DISPLAY_NAME_STORAGE_KEY, displayName);
    this.storedDisplayName.set(displayName);
  }

  private isExpired(expiresAt: string): boolean {
    const expiresAtMs = new Date(expiresAt).getTime();
    return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
  }
}
