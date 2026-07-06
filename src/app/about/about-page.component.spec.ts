import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AboutPageComponent } from './about-page.component';

describe('AboutPageComponent', () => {
  let fixture: ComponentFixture<AboutPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
  });

  it('renders project details as a list with a centered games link', () => {
    const root = fixture.nativeElement as HTMLElement;
    const items = Array.from(root.querySelectorAll('.about-list > li'));
    const actions = root.querySelector('.about-actions');
    const backLink = root.querySelector<HTMLAnchorElement>('.about-home');

    expect(items).toHaveLength(4);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('What it is'),
      expect.stringContaining('Suggestions'),
      expect.stringContaining('Open project'),
      expect.stringContaining('Contributing'),
    ]);
    expect(getComputedStyle(actions!).justifyContent).toBe('center');
    expect(backLink?.textContent).toContain('Back to games');
    expect(backLink?.getAttribute('href')).toBe('/');
  });
});
