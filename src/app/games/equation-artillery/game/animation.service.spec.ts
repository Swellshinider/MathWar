import { AnimationService } from './animation.service';

describe('AnimationService', () => {
  let frame: FrameRequestCallback | null = null;
  let frameCount = 0;

  beforeEach(() => {
    frame = null;
    frameCount = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        frameCount += 1;
        return frameCount;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('completes timeline animations from wall-clock time after a long frame gap', () => {
    const service = new AnimationService();
    const progress: number[] = [];

    service.startTimeline((nextProgress) => {
      progress.push(nextProgress);
      return true;
    }, 3000);

    frame?.(1000);
    frame?.(5000);

    expect(progress).toEqual([0, 1]);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
