import { TestBed } from '@angular/core/testing';
import { AudioSettingsService } from './audio-settings.service';

describe('AudioSettingsService', () => {
  const createdAudio: Array<{ src: string; volume: number; play: ReturnType<typeof vi.fn> }> = [];

  beforeEach(() => {
    TestBed.resetTestingModule();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    });
    createdAudio.length = 0;
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        constructor(readonly src: string) {
          createdAudio.push(this);
        }
        play = vi.fn(() => Promise.resolve());
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses 50 percent volume by default', () => {
    const service = TestBed.inject(AudioSettingsService);

    expect(service.muted()).toBe(false);
    expect(service.volume()).toBe(0.5);
  });

  it('persists global mute and clamped volume settings', () => {
    const service = TestBed.inject(AudioSettingsService);

    service.setMuted(true);
    service.setVolume(2);

    expect(service.muted()).toBe(true);
    expect(service.volume()).toBe(1);
    expect(localStorage.getItem('math-war.audio')).toBe(JSON.stringify({ muted: true, volume: 1 }));
  });

  it('restores old Equation Artillery settings when global settings do not exist', () => {
    localStorage.setItem(
      'math-war.equation-artillery.audio',
      JSON.stringify({ muted: true, volume: 0.25 }),
    );

    const service = TestBed.inject(AudioSettingsService);

    expect(service.muted()).toBe(true);
    expect(service.volume()).toBe(0.25);
  });

  it('plays one-shot effects at the configured volume', () => {
    const service = TestBed.inject(AudioSettingsService);
    service.setVolume(0.4);

    service.playOneShot('/sounds/formula-frenzy/right-answer.wav');

    expect(createdAudio[0].src).toBe('/sounds/formula-frenzy/right-answer.wav');
    expect(createdAudio[0].volume).toBe(0.4);
    expect(createdAudio[0].play).toHaveBeenCalledOnce();
  });

  it('does not play effects while muted', () => {
    const service = TestBed.inject(AudioSettingsService);
    service.setMuted(true);

    service.playOneShot('/sounds/formula-frenzy/wrong-answer.wav');

    expect(createdAudio).toHaveLength(0);
  });
});
