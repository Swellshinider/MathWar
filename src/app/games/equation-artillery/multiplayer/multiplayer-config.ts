import { InjectionToken } from '@angular/core';

export interface MultiplayerConfig {
  readonly serverUrl: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

declare global {
  interface Window {
    MATH_WAR_CONFIG?: Partial<MultiplayerConfig>;
  }
}

export const MULTIPLAYER_CONFIG = new InjectionToken<MultiplayerConfig>('MULTIPLAYER_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    serverUrl: window.MATH_WAR_CONFIG?.serverUrl ?? 'http://localhost:3000',
    supabaseUrl: window.MATH_WAR_CONFIG?.supabaseUrl ?? '',
    supabasePublishableKey: window.MATH_WAR_CONFIG?.supabasePublishableKey ?? '',
  }),
});
