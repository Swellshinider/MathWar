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
});
