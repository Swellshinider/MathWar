import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

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

  it('opens the About dialog from the header', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector<HTMLDialogElement>('app-site-header dialog')!;
    const showModal = vi.fn();
    dialog.showModal = showModal;

    root
      .querySelector<HTMLButtonElement>('app-site-header button[aria-haspopup="dialog"]')!
      .click();

    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.textContent).toContain('MathWar is an open-source math mini-game collection.');
    expect(dialog.textContent).toContain('Equation Artillery');
    expect(dialog.textContent).toContain('Graphwar');
    expect(
      dialog.querySelector<HTMLAnchorElement>(
        'a[href="https://github.com/Swellshinider/MathWar/issues"]',
      ),
    ).not.toBeNull();
  });
});
