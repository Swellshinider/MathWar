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

    expect(harness.routeNativeElement?.textContent).toContain('Choose your challenge');
  });

  it('opens Equation Artillery at its direct route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/equation-artillery');

    expect(harness.routeNativeElement?.querySelector('app-board')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Equation Artillery');
    expect(harness.routeNativeElement?.textContent).not.toContain('Focus on game');
  });

  it('redirects unknown paths to the catalog', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/missing-game');

    expect(router.url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Choose your challenge');
  });
});
