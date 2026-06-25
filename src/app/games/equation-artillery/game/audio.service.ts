import { Injectable, computed, signal } from '@angular/core';
import { Point } from '../models/point';
import { WORLD_BOUNDS } from '../models/world-bounds';

interface AudioSettings {
  readonly muted: boolean;
  readonly volume: number;
}

type BrowserAudioContext = AudioContext & {
  readonly createStereoPanner?: () => StereoPannerNode;
};

const STORAGE_KEY = 'math-war.equation-artillery.audio';
const DEFAULT_SETTINGS: AudioSettings = { muted: false, volume: 0.5 };
const SOUND_URLS = {
  fire: '/sounds/fire.wav',
  wallHit: '/sounds/wall-hit.wav',
  enemyHit: '/sounds/enemy-hit.wav',
  win: '/sounds/win.wav',
  lose: '/sounds/lose.wav',
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readSettings(): AudioSettings {
  try {
    const storage = globalThis.localStorage;
    const stored = storage.getItem(STORAGE_KEY);
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
export class EquationArtilleryAudioService {
  private readonly settingsState = signal<AudioSettings>(readSettings());
  private context: BrowserAudioContext | null = null;
  private travelOscillator: OscillatorNode | null = null;
  private travelGain: GainNode | null = null;
  private travelPanner: StereoPannerNode | null = null;
  private previousPoint: Point | null = null;

  readonly settings = this.settingsState.asReadonly();
  readonly muted = computed(() => this.settings().muted);
  readonly volume = computed(() => this.settings().volume);

  setMuted(muted: boolean): void {
    this.updateSettings({ ...this.settings(), muted });
    if (muted) this.stopEquationSound();
    else void this.resume();
  }

  setVolume(volume: number): void {
    const nextVolume = clamp(volume, 0, 1);
    this.updateSettings({ ...this.settings(), volume: nextVolume });
    if (this.travelGain) {
      const context = this.ensureContext();
      if (!context) return;
      this.travelGain.gain.setTargetAtTime(this.effectiveTravelVolume(), context.currentTime, 0.02);
    }
  }

  playFire(): void {
    this.playOneShot(SOUND_URLS.fire);
  }

  playWallHit(): void {
    this.playOneShot(SOUND_URLS.wallHit);
  }

  playEnemyHit(): void {
    this.playOneShot(SOUND_URLS.enemyHit);
  }

  playWin(): void {
    this.playOneShot(SOUND_URLS.win);
  }

  playLose(): void {
    this.playOneShot(SOUND_URLS.lose);
  }

  startEquationSound(point: Point): void {
    if (this.muted()) return;
    const context = this.ensureContext();
    if (!context) return;
    void context.resume?.();
    this.stopEquationSound();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner?.() ?? null;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(this.effectiveTravelVolume(), context.currentTime + 0.04);
    oscillator.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(context.destination);
    } else {
      gain.connect(context.destination);
    }
    oscillator.start();
    this.travelOscillator = oscillator;
    this.travelGain = gain;
    this.travelPanner = panner;
    this.previousPoint = null;
    this.updateEquationSound(point);
  }

  updateEquationSound(point: Point): void {
    const oscillator = this.travelOscillator;
    if (!oscillator) return;
    const context = this.ensureContext();
    if (!context) return;
    const normalizedX = clamp(
      (point.x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX),
      0,
      1,
    );
    const normalizedY = clamp(
      (point.y - WORLD_BOUNDS.minY) / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY),
      0,
      1,
    );
    const previousPoint = this.previousPoint;
    const slope =
      previousPoint && point.x !== previousPoint.x
        ? clamp((point.y - previousPoint.y) / (point.x - previousPoint.x), -4, 4)
        : 0;
    const frequency = clamp(140 + normalizedY * 520 + normalizedX * 180 + slope * 18, 120, 920);
    oscillator.frequency.setTargetAtTime(frequency, context.currentTime, 0.025);
    this.travelPanner?.pan.setTargetAtTime(normalizedX * 2 - 1, context.currentTime, 0.04);
    this.previousPoint = point;
  }

  stopEquationSound(): void {
    const oscillator = this.travelOscillator;
    const gain = this.travelGain;
    if (!oscillator || !gain || !this.context) return;
    const stopAt = this.context.currentTime + 0.05;
    gain.gain.cancelScheduledValues(this.context.currentTime);
    gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    try {
      oscillator.stop(stopAt);
    } catch {
      // The oscillator may already have been stopped by the browser.
    }
    this.travelOscillator = null;
    this.travelGain = null;
    this.travelPanner = null;
    this.previousPoint = null;
  }

  async resume(): Promise<void> {
    if (this.muted()) return;
    await this.ensureContext()?.resume?.();
  }

  private playOneShot(url: string): void {
    if (this.muted()) return;
    try {
      const audio = new Audio(url);
      audio.volume = this.volume();
      void audio.play().catch(() => undefined);
    } catch {
      // Audio is best-effort and should never break game input.
    }
  }

  private effectiveTravelVolume(): number {
    return this.muted() ? 0 : this.volume() * 0.12;
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
