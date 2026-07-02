import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { LeaderboardPageComponent } from './leaderboard-page.component';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardPageComponent', () => {
  let fixture: ComponentFixture<LeaderboardPageComponent>;
  const leaderboard = {
    list: vi.fn(),
  };

  beforeEach(async () => {
    leaderboard.list.mockResolvedValue({
      entries: [
        {
          id: 'entry-1',
          gameId: 'formula-frenzy',
          accountId: 'account-1',
          username: 'player_one',
          rank: 1,
          score: 500,
          level: 4,
          averageTimeMs: 1200,
          bestStreak: 8,
          totalCorrect: 20,
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      searchResult: null,
      page: 1,
      pageSize: 10,
      total: 12,
      sort: 'rank',
    });

    await TestBed.configureTestingModule({
      imports: [LeaderboardPageComponent],
      providers: [
        provideRouter([]),
        { provide: LeaderboardService, useValue: leaderboard },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'gameId' ? 'formula-frenzy' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeaderboardPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads and renders Formula Frenzy leaderboard rows', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Formula Frenzy Leaderboard');
    expect(root.textContent).toContain('player_one');
    expect(root.textContent).toContain('500');
    expect(root.textContent).toContain('1.2s');
    expect(leaderboard.list).toHaveBeenCalledWith('formula-frenzy', {
      page: 1,
      pageSize: 10,
      sort: 'rank',
      username: '',
    });
  });

  it('changes sort and paginates', async () => {
    const root = fixture.nativeElement as HTMLElement;

    Array.from(root.querySelectorAll<HTMLButtonElement>('th button'))
      .find((button) => button.textContent?.includes('Level'))
      ?.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('.pagination button:last-child')?.click();
    await fixture.whenStable();

    expect(leaderboard.list).toHaveBeenCalledWith('formula-frenzy', {
      page: 1,
      pageSize: 10,
      sort: 'level',
      username: '',
    });
    expect(leaderboard.list).toHaveBeenCalledWith('formula-frenzy', {
      page: 2,
      pageSize: 10,
      sort: 'level',
      username: '',
    });
  });
});
