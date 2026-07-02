import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('application routes', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens the game catalog at the root route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    expect(harness.routeNativeElement?.textContent).toContain('Practice mathematical ideas');
  });

  it('opens the About page at its direct route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/about');

    expect(harness.routeNativeElement?.textContent).toContain('About MathWar');
    expect(harness.routeNativeElement?.textContent).toContain('Suggestions');
    expect(harness.routeNativeElement?.textContent).toContain('Contributing');
    expect(harness.routeNativeElement?.textContent).not.toContain('Inspiration');
  });

  it('opens account pages at their direct routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/account/login');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');

    await harness.navigateByUrl('/account/create');
    expect(harness.routeNativeElement?.textContent).toContain('Create account');

    await harness.navigateByUrl('/account/settings');
    expect(harness.routeNativeElement?.textContent).toContain('Account');
  });

  it('opens Equation Artillery at its direct route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/equation-artillery');

    expect(harness.routeNativeElement?.querySelector('app-board')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Equation Artillery');
    expect(harness.routeNativeElement?.textContent).not.toContain('Focus on game');
  }, 10000);

  it('opens Formula Frenzy at its direct route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/formula-frenzy');

    expect(harness.routeNativeElement?.textContent).toContain('Formula Frenzy');
    expect(harness.routeNativeElement?.textContent).toContain('Solve fast');
  });

  it('opens the Formula Frenzy leaderboard at its direct route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              entries: [],
              searchResult: null,
              page: 1,
              pageSize: 10,
              total: 0,
              sort: 'rank',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/leaderboard/formula-frenzy');

    expect(harness.routeNativeElement?.textContent).toContain('Formula Frenzy Leaderboard');
    expect(harness.routeNativeElement?.textContent).toContain('Find username');
  });

  it('opens Formula Frenzy multiplayer at its direct route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/formula-frenzy/multiplayer');

    expect(harness.routeNativeElement?.textContent).toContain('Formula Frenzy Multiplayer');
    expect(harness.routeNativeElement?.textContent).toContain('Enter a display name');
  });

  it('opens the separate multiplayer route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/equation-artillery/multiplayer');

    expect(harness.routeNativeElement?.textContent).toContain('Equation Artillery Multiplayer');
    expect(harness.routeNativeElement?.textContent).toContain('Enter a display name');
  });

  it('redirects unknown paths to the catalog', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/missing-game');

    expect(router.url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Practice mathematical ideas');
  });
});
