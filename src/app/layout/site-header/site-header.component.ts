import { PercentPipe } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideVolume2 } from '@lucide/angular';
import { AudioSettingsService } from '../../shared/audio/audio-settings.service';

@Component({
  selector: 'app-site-header',
  imports: [FormsModule, LucideVolume2, PercentPipe, RouterLink],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.scss',
})
export class SiteHeaderComponent implements OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly audio = inject(AudioSettingsService);
  private closeSoundMenuTimer: ReturnType<typeof setTimeout> | null = null;

  readonly muted = this.audio.muted;
  readonly volume = this.audio.volume;
  readonly soundMenuOpen = signal(false);

  openSoundMenu(): void {
    this.clearScheduledSoundMenuClose();
    this.soundMenuOpen.set(true);
    void this.audio.resume();
  }

  closeSoundMenu(): void {
    this.clearScheduledSoundMenuClose();
    this.soundMenuOpen.set(false);
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
    if (!this.element.nativeElement.contains(event.target as Node)) this.closeSoundMenu();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.closeSoundMenu();
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
