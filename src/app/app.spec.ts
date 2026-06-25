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
});
