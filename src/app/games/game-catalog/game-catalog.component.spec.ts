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

  it('lists available games and links to their routes', () => {
    const fixture = TestBed.createComponent(GameCatalogComponent);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll(
      '.game-card',
    ) as NodeListOf<HTMLAnchorElement>;
    const images = fixture.nativeElement.querySelectorAll(
      '.game-card__preview',
    ) as NodeListOf<HTMLImageElement>;
    expect(fixture.nativeElement.textContent).toContain('Equation Artillery');
    expect(fixture.nativeElement.textContent).toContain('Formula Frenzy');
    expect(links[0].getAttribute('href')).toBe('/games/equation-artillery');
    expect(links[1].getAttribute('href')).toBe('/games/formula-frenzy');
    expect(images[0].getAttribute('src')).toBe('images/equation-artillery.png');
    expect(images[1].getAttribute('src')).toBe('images/formula-frenzy.png');
  });

  it('does not render unavailable placeholder games', () => {
    const fixture = TestBed.createComponent(GameCatalogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.game-card')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('More math games are coming.');
  });
});
