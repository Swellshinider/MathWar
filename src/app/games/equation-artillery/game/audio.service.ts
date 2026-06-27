import { Injectable, inject } from '@angular/core';
import { AudioSettingsService } from '../../../shared/audio/audio-settings.service';
import { Point } from '../models/point';
import { WORLD_BOUNDS } from '../models/world-bounds';

type BrowserAudioContext = AudioContext & {
  readonly createStereoPanner?: () => StereoPannerNode;
};

const SOUND_URLS = {
  fire: '/sounds/equation-artillery/fire.wav',
  wallHit: '/sounds/equation-artillery/wall-hit.wav',
  enemyHit: '/sounds/equation-artillery/enemy-hit.wav',
  win: '/sounds/equation-artillery/win.wav',
  lose: '/sounds/equation-artillery/lose.wav',
} as const;
export const TRAVEL_AUDIO_PITCH_CONFIG = {
  baseFrequency: 100,
  yInfluence: 520,
  xInfluence: 180,
  slopeInfluence: 18,
  minFrequency: 120,
  maxFrequency: 920,
  smoothingTime: 0.025,
  slopeLimit: 4,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

@Injectable({ providedIn: 'root' })
export class EquationArtilleryAudioService {
  private readonly audio = inject(AudioSettingsService);
  private travelOscillator: OscillatorNode | null = null;
  private travelGain: GainNode | null = null;
  private travelPanner: StereoPannerNode | null = null;
  private previousPoint: Point | null = null;

  readonly muted = this.audio.muted;
  readonly volume = this.audio.volume;

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    if (muted) this.stopEquationSound();
  }

  setVolume(volume: number): void {
    this.audio.setVolume(volume);
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
    const slopeLimit = TRAVEL_AUDIO_PITCH_CONFIG.slopeLimit;
    const slope =
      previousPoint && point.x !== previousPoint.x
        ? clamp((point.y - previousPoint.y) / (point.x - previousPoint.x), -slopeLimit, slopeLimit)
        : 0;
    const frequency = clamp(
      TRAVEL_AUDIO_PITCH_CONFIG.baseFrequency +
        normalizedY * TRAVEL_AUDIO_PITCH_CONFIG.yInfluence +
        normalizedX * TRAVEL_AUDIO_PITCH_CONFIG.xInfluence +
        slope * TRAVEL_AUDIO_PITCH_CONFIG.slopeInfluence,
      TRAVEL_AUDIO_PITCH_CONFIG.minFrequency,
      TRAVEL_AUDIO_PITCH_CONFIG.maxFrequency,
    );
    oscillator.frequency.setTargetAtTime(
      frequency,
      context.currentTime,
      TRAVEL_AUDIO_PITCH_CONFIG.smoothingTime,
    );
    this.travelPanner?.pan.setTargetAtTime(normalizedX * 2 - 1, context.currentTime, 0.04);
    this.previousPoint = point;
  }

  stopEquationSound(): void {
    const oscillator = this.travelOscillator;
    const gain = this.travelGain;
    const context = this.ensureContext();
    if (!oscillator || !gain || !context) return;
    const stopAt = context.currentTime + 0.05;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(0, context.currentTime, 0.02);
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
    await this.audio.resume();
  }

  ngOnDestroy(): void {
    this.stopEquationSound();
  }

  private playOneShot(url: string): void {
    this.audio.playOneShot(url);
  }

  private effectiveTravelVolume(): number {
    return this.muted() ? 0 : this.volume() * 0.12;
  }

  private ensureContext(): BrowserAudioContext | null {
    return this.audio.createContext();
  }
}
