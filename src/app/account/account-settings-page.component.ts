import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountAuthService } from './account-auth.service';
import {
  AccountAchievement,
  AccountProgress,
  AccountProgressService,
  AchievementId,
} from './account-progress.service';

@Component({
  selector: 'app-account-settings-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account-settings-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountSettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly progressService = inject(AccountProgressService);
  private readonly router = inject(Router);
  readonly auth = inject(AccountAuthService);
  readonly avatarPreview = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly progress = signal<AccountProgress | null>(null);
  readonly progressLoading = signal(false);
  readonly progressError = signal<string | null>(null);
  private progressLoadedFor: string | null = null;

  readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(15)]],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.minLength(8)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user)
        this.profileForm.controls.displayName.setValue(user.displayName, { emitEvent: false });
      if (this.auth.ready() && user && this.progressLoadedFor !== user.id) {
        this.progressLoadedFor = user.id;
        void this.loadProgress();
      }
    });
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.status.set(
      (await this.auth.updateProfile(this.profileForm.controls.displayName.value))
        ? 'Profile updated.'
        : null,
    );
  }

  async savePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const ok = await this.auth.updatePassword(
      this.passwordForm.controls.currentPassword.value,
      this.passwordForm.controls.newPassword.value,
    );
    this.status.set(ok ? 'Password updated. Sign in again to continue.' : null);
    if (ok) this.passwordForm.reset();
  }

  async chooseAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      this.auth.error.set('Avatar must be a PNG, JPEG, or WebP image up to 256 KB.');
      input.value = '';
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    this.avatarPreview.set(dataUrl);
    this.status.set((await this.auth.updateAvatar(dataUrl)) ? 'Avatar updated.' : null);
    input.value = '';
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }

  achievementLabel(achievement: AccountAchievement): string {
    return ACHIEVEMENTS[achievement.id].label;
  }

  achievementDescription(achievement: AccountAchievement): string {
    return ACHIEVEMENTS[achievement.id].description;
  }

  achievementTooltipId(achievement: AccountAchievement): string {
    return `achievement-tooltip-${achievement.id}`;
  }

  achievementCounter(): string {
    return `${this.progress()?.achievements.length ?? 0}/${ACHIEVEMENT_COUNT}`;
  }

  private async loadProgress(): Promise<void> {
    this.progressLoading.set(true);
    this.progressError.set(null);
    try {
      this.progress.set(await this.progressService.get());
    } catch (error) {
      this.progressError.set(error instanceof Error ? error.message : 'Could not load progress.');
    } finally {
      this.progressLoading.set(false);
    }
  }
}

const ACHIEVEMENTS: Record<
  AchievementId,
  { readonly label: string; readonly description: string }
> = {
  first_run: {
    label: 'First run',
    description: 'Finish one timed Formula Frenzy run.',
  },
  level_5: {
    label: 'Level 5',
    description: 'Reach level 5 in a timed Formula Frenzy run.',
  },
  level_10: {
    label: 'Level 10',
    description: 'Reach level 10 in a timed Formula Frenzy run.',
  },
  legend_level: {
    label: 'MathWar Legend',
    description: 'Reach level 25 in a timed Formula Frenzy run.',
  },
  score_1000: {
    label: '1,000 score',
    description: 'Score at least 1,000 points in one timed run.',
  },
  score_5000: {
    label: '5,000 score',
    description: 'Score at least 5,000 points in one timed run.',
  },
  streak_10: {
    label: '10 streak',
    description: 'Reach a best streak of 10 in one timed run.',
  },
  streak_25: {
    label: '25 streak',
    description: 'Reach a best streak of 25 in one timed run.',
  },
  twenty_correct: {
    label: '20 correct',
    description: 'Solve at least 20 formulas in one timed run.',
  },
  quick_solver: {
    label: 'Quick solver',
    description: 'Average 3.0 seconds or faster with at least 10 correct answers.',
  },
  hardcore_debut: {
    label: 'Hardcore debut',
    description: 'Finish one Hardcore Formula Frenzy run.',
  },
  hardcore_level_5: {
    label: 'Hardcore level 5',
    description: 'Reach level 5 in a Hardcore run.',
  },
  hardcore_level_10: {
    label: 'Hardcore level 10',
    description: 'Reach level 10 in a Hardcore run.',
  },
};

const ACHIEVEMENT_COUNT = Object.keys(ACHIEVEMENTS).length;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
