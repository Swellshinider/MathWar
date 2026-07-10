import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { App } from './app';
import { SiteHeaderComponent } from './layout/site-header/site-header.component';
import { PlayFocusService } from './shared/game-frame/play-focus.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the site chrome without a Games navigation item', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.skip-link')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-header')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-footer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-header nav')).toBeNull();

    const root = fixture.nativeElement as HTMLElement;
    const brand = root.querySelector<HTMLAnchorElement>('.brand')!;
    const logo = brand.querySelector<HTMLImageElement>('.brand-logo')!;

    expect(brand.textContent).toContain('MathWar');
    expect(brand.getAttribute('aria-label')).toBe('MathWar home');
    expect(logo.getAttribute('src')).toBe('mathwar-logo.png');
    expect(logo.getAttribute('alt')).toBe('');
  });

  it('links to the About page from the header', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const aboutLink = root.querySelector<HTMLAnchorElement>('app-site-header a[href="/about"]')!;

    expect(root.querySelector('app-site-header dialog')).toBeNull();
    expect(aboutLink.textContent).toContain('About');
  });

  it('opens global sound controls from the header', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const soundButton = root.querySelector<HTMLButtonElement>(
      'app-site-header button[aria-label="Sound settings"]',
    )!;

    soundButton.click();
    fixture.detectChanges();

    const menu = root.querySelector<HTMLElement>('#sound-settings-menu')!;
    expect(soundButton.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('Mute sound');
    expect(menu.querySelector<HTMLInputElement>('input[type="range"]')).not.toBeNull();
  });

  it('keeps global sound controls open while moving from the button to the menu', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header = fixture.debugElement.query(By.directive(SiteHeaderComponent))
      .componentInstance as SiteHeaderComponent;

    header.openSoundMenu();
    header.scheduleSoundMenuClose();
    header.openSoundMenu();
    vi.advanceTimersByTime(200);

    expect(header.soundMenuOpen()).toBe(true);
    vi.useRealTimers();
  });

  it('offers system, light, and dark appearance preferences', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>(
      'app-site-header button[aria-label="Appearance settings"]',
    )!;

    button.click();
    fixture.detectChanges();

    const menu = root.querySelector<HTMLElement>('#theme-settings-menu')!;
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('System');
    expect(menu.textContent).toContain('Light');
    expect(menu.textContent).toContain('Dark');
  });

  it('uses compact chrome during play and expands it with Escape', () => {
    const fixture = TestBed.createComponent(App);
    const playFocus = TestBed.inject(PlayFocusService);
    playFocus.setPlaying({ gameId: 'formula-frenzy', title: 'Formula Frenzy' }, true);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-site-footer')).toBeNull();
    expect(root.querySelector('header')?.classList).toContain('header--focused');
    expect(root.textContent).toContain('Expand');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(playFocus.canResume()).toBe(true);
    expect(root.querySelector('app-site-footer')).not.toBeNull();
    expect(root.textContent).toContain('Focus game');
  });
});
