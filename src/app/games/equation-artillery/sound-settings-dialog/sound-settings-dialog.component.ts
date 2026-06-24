import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EquationArtilleryAudioService } from '../game/audio.service';

@Component({
  selector: 'app-sound-settings-dialog',
  imports: [FormsModule, PercentPipe],
  templateUrl: './sound-settings-dialog.component.html',
  styleUrl: './sound-settings-dialog.component.scss',
})
export class SoundSettingsDialogComponent {
  private readonly audio = inject(EquationArtilleryAudioService);
  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;

  readonly muted = this.audio.muted;
  readonly volume = this.audio.volume;

  open(): void {
    const dialog = this.dialogRef.nativeElement;
    void this.audio.resume();
    if (!dialog.open) dialog.showModal();
  }

  close(): void {
    this.dialogRef.nativeElement.close();
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setVolume(value: string | number): void {
    this.audio.setVolume(Number(value));
  }
}
