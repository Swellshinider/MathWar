import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountAuthService } from './account-auth.service';

@Component({
  selector: 'app-account-settings-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account-settings-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountSettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly auth = inject(AccountAuthService);
  readonly avatarPreview = signal<string | null>(null);
  readonly status = signal<string | null>(null);

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
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
