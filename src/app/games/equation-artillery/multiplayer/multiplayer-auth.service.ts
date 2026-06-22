import { Injectable, inject, signal } from '@angular/core';
import { AuthError, createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';

@Injectable({ providedIn: 'root' })
export class MultiplayerAuthService {
  private readonly config = inject(MULTIPLAYER_CONFIG);
  private readonly client: SupabaseClient | null =
    this.config.supabaseUrl && this.config.supabaseAnonKey
      ? createClient(this.config.supabaseUrl, this.config.supabaseAnonKey)
      : null;
  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (!this.client) {
      this.error.set('Supabase is not configured for this deployment.');
      this.ready.set(true);
      return;
    }
    void this.client.auth.getSession().then(({ data, error }) => {
      this.session.set(data.session);
      this.setError(error);
      this.ready.set(true);
    });
    this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/games/equation-artillery/multiplayer` },
    });
    this.setError(error);
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    this.setError(error);
  }

  private setError(error: AuthError | null): void {
    this.error.set(error?.message ?? null);
  }
}
