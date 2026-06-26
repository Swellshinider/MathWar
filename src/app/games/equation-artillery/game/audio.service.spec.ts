import { TestBed } from '@angular/core/testing';
import { EquationArtilleryAudioService, TRAVEL_AUDIO_PITCH_CONFIG } from './audio.service';

describe('EquationArtilleryAudioService', () => {
  const createdAudio: Array<{ src: string; volume: number; play: ReturnType<typeof vi.fn> }> = [];
  let oscillator: {
    type: OscillatorType;
    frequency: { setTargetAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let gain: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      setTargetAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  };
  let panner: {
    pan: { setTargetAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
  };
  let context: {
    currentTime: number;
    destination: object;
    resume: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createStereoPanner: ReturnType<typeof vi.fn>;
  };

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
    oscillator = {
      type: 'sine',
      frequency: { setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    };
    panner = {
      pan: { setTargetAtTime: vi.fn() },
      connect: vi.fn(),
    };
    context = {
      currentTime: 1,
      destination: {},
      resume: vi.fn(() => Promise.resolve()),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      createStereoPanner: vi.fn(() => panner),
    };
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
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        constructor() {
          return context;
        }
      },
      configurable: true,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('persists mute and volume settings', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);

    service.setMuted(true);
    service.setVolume(0.35);

    expect(service.muted()).toBe(true);
    expect(service.volume()).toBe(0.35);
    expect(localStorage.getItem('math-war.equation-artillery.audio')).toBe(
      JSON.stringify({ muted: true, volume: 0.35 }),
    );
  });

  it('uses 50 percent volume by default', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);

    expect(service.muted()).toBe(false);
    expect(service.volume()).toBe(0.5);
  });

  it('restores saved volume settings from local storage', () => {
    localStorage.setItem(
      'math-war.equation-artillery.audio',
      JSON.stringify({ muted: false, volume: 0.25 }),
    );

    const service = TestBed.inject(EquationArtilleryAudioService);

    expect(service.muted()).toBe(false);
    expect(service.volume()).toBe(0.25);
  });

  it('plays one-shot effects at the configured volume', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);
    service.setVolume(0.5);

    service.playFire();

    expect(createdAudio[0].src).toBe('/sounds/fire.wav');
    expect(createdAudio[0].volume).toBe(0.5);
    expect(createdAudio[0].play).toHaveBeenCalledOnce();
  });

  it('does not play effects while muted', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);
    service.setMuted(true);

    service.playEnemyHit();

    expect(createdAudio).toHaveLength(0);
  });

  it('generates, updates, and stops equation travel audio', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);

    service.startEquationSound({ x: -16, y: -10 });
    service.updateEquationSound({ x: 16, y: 10 });
    service.stopEquationSound();

    expect(context.resume).toHaveBeenCalled();
    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(oscillator.frequency.setTargetAtTime).toHaveBeenCalled();
    expect(panner.pan.setTargetAtTime).toHaveBeenCalled();
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, context.currentTime, 0.02);
    expect(oscillator.stop).toHaveBeenCalled();
  });

  it('derives travel audio pitch from the named tuning config and clamps the range', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);

    service.startEquationSound({ x: -16, y: -10 });
    service.updateEquationSound({ x: 16, y: 10 });
    service.updateEquationSound({ x: 16.1, y: 20 });
    service.updateEquationSound({ x: -17, y: 10 });
    service.updateEquationSound({ x: -16, y: -10 });

    expect(oscillator.frequency.setTargetAtTime).toHaveBeenNthCalledWith(
      1,
      TRAVEL_AUDIO_PITCH_CONFIG.minFrequency,
      context.currentTime,
      TRAVEL_AUDIO_PITCH_CONFIG.smoothingTime,
    );
    expect(oscillator.frequency.setTargetAtTime).toHaveBeenNthCalledWith(
      2,
      TRAVEL_AUDIO_PITCH_CONFIG.baseFrequency +
        TRAVEL_AUDIO_PITCH_CONFIG.yInfluence +
        TRAVEL_AUDIO_PITCH_CONFIG.xInfluence +
        TRAVEL_AUDIO_PITCH_CONFIG.slopeInfluence * 0.625,
      context.currentTime,
      TRAVEL_AUDIO_PITCH_CONFIG.smoothingTime,
    );
    const generatedFrequencies = oscillator.frequency.setTargetAtTime.mock.calls.map(
      ([frequency]) => frequency,
    );
    expect(Math.max(...generatedFrequencies)).toBeLessThanOrEqual(
      TRAVEL_AUDIO_PITCH_CONFIG.maxFrequency,
    );
    expect(oscillator.frequency.setTargetAtTime).toHaveBeenNthCalledWith(
      5,
      TRAVEL_AUDIO_PITCH_CONFIG.minFrequency,
      context.currentTime,
      TRAVEL_AUDIO_PITCH_CONFIG.smoothingTime,
    );
  });

  it('stops generated travel audio when the document becomes hidden', () => {
    const service = TestBed.inject(EquationArtilleryAudioService);
    service.startEquationSound({ x: 0, y: 0 });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(oscillator.stop).toHaveBeenCalled();
  });
});
