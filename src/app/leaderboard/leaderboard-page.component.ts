import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LeaderboardDifficulty,
  LeaderboardEntry,
  LeaderboardGameId,
  LeaderboardPage,
  LeaderboardService,
  LeaderboardSort,
} from './leaderboard.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-leaderboard-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './leaderboard-page.component.html',
  styleUrl: './leaderboard-page.component.scss',
})
export class LeaderboardPageComponent implements OnInit {
  private readonly leaderboard = inject(LeaderboardService);
  private readonly route = inject(ActivatedRoute);

  readonly gameId = signal<LeaderboardGameId | null>(null);
  readonly page = signal(1);
  readonly sort = signal<LeaderboardSort>('rank');
  readonly difficulty = signal<LeaderboardDifficulty>('normal');
  readonly username = signal('');
  readonly data = signal<LeaderboardPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil((this.data()?.total ?? 0) / PAGE_SIZE)),
  );
  readonly title = computed(() =>
    this.gameId() === 'formula-frenzy' ? 'Formula Frenzy Leaderboard' : 'Leaderboard',
  );

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId');
    if (gameId !== 'formula-frenzy') {
      this.error.set('This leaderboard is not available yet.');
      return;
    }
    this.gameId.set(gameId);
    void this.load();
  }

  async load(): Promise<void> {
    const gameId = this.gameId();
    if (!gameId || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(
        await this.leaderboard.list(gameId, {
          page: this.page(),
          pageSize: PAGE_SIZE,
          sort: this.sort(),
          difficulty: this.difficulty(),
          username: this.username(),
        }),
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load the leaderboard.');
    } finally {
      this.loading.set(false);
    }
  }

  setSort(sort: LeaderboardSort): void {
    if (this.sort() === sort) return;
    this.sort.set(sort);
    this.page.set(1);
    void this.load();
  }

  setDifficulty(difficulty: LeaderboardDifficulty): void {
    if (this.difficulty() === difficulty) return;
    this.difficulty.set(difficulty);
    this.page.set(1);
    void this.load();
  }

  search(event: SubmitEvent): void {
    event.preventDefault();
    this.page.set(1);
    void this.load();
  }

  previousPage(): void {
    if (this.page() <= 1) return;
    this.page.update((page) => page - 1);
    void this.load();
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((page) => page + 1);
    void this.load();
  }

  formatAverage(entry: Pick<LeaderboardEntry, 'averageTimeMs'>): string {
    return entry.averageTimeMs === null ? '0.0s' : `${(entry.averageTimeMs / 1000).toFixed(1)}s`;
  }
}
