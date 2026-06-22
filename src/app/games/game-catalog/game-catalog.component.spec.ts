import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { GameCatalogComponent } from './game-catalog.component';

describe('GameCatalogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameCatalogComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('lists Equation Artillery and links to its route', () => {
    const fixture = TestBed.createComponent(GameCatalogComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.game-card a') as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain('Equation Artillery');
    expect(link.getAttribute('href')).toBe('/games/equation-artillery');
  });

  it('does not render unavailable placeholder games', () => {
    const fixture = TestBed.createComponent(GameCatalogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.game-card')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('More math games are coming.');
  });
});
