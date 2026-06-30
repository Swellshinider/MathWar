import { TestBed } from '@angular/core/testing';
import { SiteFooterComponent } from './site-footer.component';

describe('SiteFooterComponent', () => {
  it('shows the current year in the copyright notice', async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooterComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SiteFooterComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(`© ${new Date().getFullYear()} MathWar`);
  });

  it('links to the GitHub repository', async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooterComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SiteFooterComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toContain('GitHub Repository');
    expect(link.getAttribute('href')).toBe('https://github.com/Swellshinider/MathWar');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
