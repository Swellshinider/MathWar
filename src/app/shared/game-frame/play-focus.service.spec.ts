import { TestBed } from '@angular/core/testing';
import { PlayFocusService } from './play-focus.service';

describe('PlayFocusService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('activates, suspends, and resumes the current play cycle', () => {
    const service = TestBed.inject(PlayFocusService);
    const context = { gameId: 'formula-frenzy' as const, title: 'Formula Frenzy' };

    service.setPlaying(context, true);
    expect(service.active()).toBe(true);
    expect(service.context()).toEqual(context);

    service.suspend();
    expect(service.active()).toBe(false);
    expect(service.canResume()).toBe(true);

    service.resume();
    expect(service.active()).toBe(true);
  });

  it('resets a suspension when a new play cycle starts', () => {
    const service = TestBed.inject(PlayFocusService);
    const context = { gameId: 'math-cross' as const, title: 'Math Cross' };

    service.setPlaying(context, true);
    service.suspend();
    service.setPlaying(context, false);
    service.setPlaying(context, true);

    expect(service.active()).toBe(true);
    expect(service.suspended()).toBe(false);
  });

  it('clears all focus state when its game frame is destroyed', () => {
    const service = TestBed.inject(PlayFocusService);
    service.setPlaying({ gameId: 'equation-artillery', title: 'Equation Artillery' }, true);

    service.clear();

    expect(service.active()).toBe(false);
    expect(service.playing()).toBe(false);
    expect(service.context()).toBeNull();
  });
});
