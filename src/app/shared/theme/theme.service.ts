import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

const STORAGE_KEY = 'math-war.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery = this.createMediaQuery();
  private readonly systemDark = signal(this.mediaQuery?.matches ?? true);
  private readonly preferenceState = signal<ThemePreference>(this.readPreference());

  readonly preference = this.preferenceState.asReadonly();
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const preference = this.preferenceState();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  private readonly mediaListener = (event: MediaQueryListEvent): void => {
    this.systemDark.set(event.matches);
  };

  constructor() {
    this.mediaQuery?.addEventListener('change', this.mediaListener);
    effect(() => {
      const theme = this.resolvedTheme();
      this.document.documentElement.dataset['theme'] = theme;
      this.document.documentElement.style.colorScheme = theme;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
      // A blocked storage API should not prevent the theme from changing for this visit.
    }
  }

  private createMediaQuery(): MediaQueryList | null {
    return typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-color-scheme: dark)')
      : null;
  }

  private readPreference(): ThemePreference {
    try {
      const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (saved === 'system' || saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Fall through to the system preference when storage is unavailable.
    }
    return 'system';
  }
}
