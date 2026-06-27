import { Injectable, computed, signal } from '@angular/core';

interface AudioSettings {
  readonly muted: boolean;
  readonly volume: number;
}

type BrowserAudioContext = AudioContext & {
  readonly createStereoPanner?: () => StereoPannerNode;
};

const STORAGE_KEY = 'math-war.audio';
const LEGACY_STORAGE_KEY = 'math-war.equation-artillery.audio';
const DEFAULT_SETTINGS: AudioSettings = { muted: false, volume: 0.5 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readSettings(): AudioSettings {
  try {
    const storage = globalThis.localStorage;
    const stored = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<AudioSettings>;
    return {
      muted: Boolean(parsed.muted),
      volume: clamp(Number(parsed.volume ?? DEFAULT_SETTINGS.volume), 0, 1),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

@Injectable({ providedIn: 'root' })
export class AudioSettingsService {
  private readonly settingsState = signal<AudioSettings>(readSettings());
  private context: BrowserAudioContext | null = null;

  readonly settings = this.settingsState.asReadonly();
  readonly muted = computed(() => this.settings().muted);
  readonly volume = computed(() => this.settings().volume);

  setMuted(muted: boolean): void {
    this.updateSettings({ ...this.settings(), muted });
    if (!muted) void this.resume();
  }

  setVolume(volume: number): void {
    this.updateSettings({ ...this.settings(), volume: clamp(volume, 0, 1) });
  }

  playOneShot(url: string): void {
    if (this.muted()) return;
    try {
      const audio = new Audio(url);
      audio.volume = this.volume();
      void audio.play().catch(() => undefined);
    } catch {
      // Audio is best-effort and should never break gameplay.
    }
  }

  async resume(): Promise<void> {
    if (this.muted()) return;
    await this.ensureContext()?.resume?.();
  }

  createContext(): BrowserAudioContext | null {
    return this.ensureContext();
  }

  private ensureContext(): BrowserAudioContext | null {
    if (this.context) return this.context;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    this.context = new AudioContextConstructor() as BrowserAudioContext;
    return this.context;
  }

  private updateSettings(settings: AudioSettings): void {
    this.settingsState.set(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable in tests, SSR, or privacy modes.
    }
  }
}
