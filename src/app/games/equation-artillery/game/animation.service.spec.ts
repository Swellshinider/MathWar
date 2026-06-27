import { AnimationService } from './animation.service';

describe('AnimationService', () => {
  let frame: FrameRequestCallback | null = null;
  let timeout: (() => void) | null = null;
  let frameCount = 0;
  let timeoutCount = 0;

  beforeEach(() => {
    frame = null;
    timeout = null;
    frameCount = 0;
    timeoutCount = 0;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        frameCount += 1;
        return frameCount;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'setTimeout',
      vi.fn((callback: () => void) => {
        timeout = callback;
        timeoutCount += 1;
        return timeoutCount;
      }),
    );
    vi.stubGlobal('clearTimeout', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('completes timeline animations from wall-clock time after a long frame gap', () => {
    const service = new AnimationService();
    const progress: number[] = [];
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(5000);

    service.startTimeline((nextProgress) => {
      progress.push(nextProgress);
      return true;
    }, 3000);

    frame?.(1000);
    frame?.(5000);

    expect(progress).toEqual([0, 1]);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('continues timeline animations with a timer when the document becomes hidden', () => {
    const service = new AnimationService();
    const progress: number[] = [];
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(4000);

    service.startTimeline((nextProgress) => {
      progress.push(nextProgress);
      return true;
    }, 3000);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    timeout?.();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(setTimeout).toHaveBeenCalled();
    expect(progress).toEqual([1]);
  });

  it('continues timeline animations with a timer when the window loses focus', () => {
    const service = new AnimationService();
    const progress: number[] = [];
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(4000);

    service.startTimeline((nextProgress) => {
      progress.push(nextProgress);
      return true;
    }, 3000);
    window.dispatchEvent(new Event('blur'));
    timeout?.();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(setTimeout).toHaveBeenCalled();
    expect(progress).toEqual([1]);
  });

  it('cancels hidden timeline timers', () => {
    const service = new AnimationService();
    const render = vi.fn(() => true);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    service.startTimeline(render, 3000);
    service.cancel();
    timeout?.();

    expect(clearTimeout).toHaveBeenCalledWith(1);
    expect(render).not.toHaveBeenCalled();
  });
});
