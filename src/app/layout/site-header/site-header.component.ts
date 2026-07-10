import { PercentPipe } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideHome,
  LucideMaximize2,
  LucideMonitor,
  LucideMoon,
  LucideSun,
  LucideUser,
  LucideVolume2,
} from '@lucide/angular';
import { AccountAuthService } from '../../account/account-auth.service';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';
import { PlayFocusService } from '../../shared/game-frame/play-focus.service';
import { ThemePreference, ThemeService } from '../../shared/theme/theme.service';

@Component({
  selector: 'app-site-header',
  imports: [
    FormsModule,
    LucideHome,
    LucideMaximize2,
    LucideMonitor,
    LucideMoon,
    LucideSun,
    LucideUser,
    LucideVolume2,
    PercentPipe,
    RouterLink,
  ],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.scss',
})
export class SiteHeaderComponent implements OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>);
  readonly account = inject(AccountAuthService);
  private readonly audio = inject(AudioSettingsService);
  readonly playFocus = inject(PlayFocusService);
  readonly theme = inject(ThemeService);
  private closeSoundMenuTimer: ReturnType<typeof setTimeout> | null = null;

  readonly muted = this.audio.muted;
  readonly volume = this.audio.volume;
  readonly soundMenuOpen = signal(false);
  readonly themeMenuOpen = signal(false);

  openSoundMenu(): void {
    this.clearScheduledSoundMenuClose();
    this.themeMenuOpen.set(false);
    this.soundMenuOpen.set(true);
    void this.audio.resume();
  }

  closeSoundMenu(): void {
    this.clearScheduledSoundMenuClose();
    this.soundMenuOpen.set(false);
  }

  toggleThemeMenu(): void {
    this.closeSoundMenu();
    this.themeMenuOpen.update((open) => !open);
  }

  setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
    this.themeMenuOpen.set(false);
  }

  scheduleSoundMenuClose(): void {
    this.clearScheduledSoundMenuClose();
    this.closeSoundMenuTimer = setTimeout(() => this.closeSoundMenu(), 150);
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setVolume(value: string | number): void {
    this.audio.setVolume(Number(value));
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) {
      this.closeSoundMenu();
      this.themeMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.closeSoundMenu();
    this.themeMenuOpen.set(false);
  }

  ngOnDestroy(): void {
    this.clearScheduledSoundMenuClose();
  }

  private clearScheduledSoundMenuClose(): void {
    if (!this.closeSoundMenuTimer) return;
    clearTimeout(this.closeSoundMenuTimer);
    this.closeSoundMenuTimer = null;
  }
}
