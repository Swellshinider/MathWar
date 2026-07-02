import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AccountAuthService } from './account-auth.service';

type UsernameAvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

@Component({
  selector: 'app-create-account-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class CreateAccountPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly auth = inject(AccountAuthService);
  readonly submitting = signal(false);
  readonly usernameAvailability = signal<UsernameAvailabilityStatus>('idle');
  private usernameCheckId = 0;

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(15)]],
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(20),
        Validators.pattern(/^[a-z0-9_-]+$/),
      ],
    ],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.form.controls.username.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const normalized = value.trim().toLowerCase();
        if (value !== normalized) {
          this.form.controls.username.setValue(normalized, { emitEvent: false });
        }
      });

    this.form.controls.username.valueChanges
      .pipe(debounceTime(450), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => void this.checkUsernameAvailability(value));
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting() || this.usernameAvailability() === 'checking') {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const ok = await this.auth.register(
      this.form.controls.username.value,
      this.form.controls.password.value,
      this.form.controls.displayName.value,
    );
    this.submitting.set(false);
    if (ok) await this.router.navigateByUrl('/account/settings');
  }

  private async checkUsernameAvailability(value: string): Promise<void> {
    const username = value.trim().toLowerCase();
    const checkId = ++this.usernameCheckId;
    this.clearUsernameTakenError();
    if (!username || this.form.controls.username.invalid) {
      this.usernameAvailability.set('idle');
      return;
    }
    this.usernameAvailability.set('checking');
    const result = await this.auth.checkUsernameAvailability(username);
    if (checkId !== this.usernameCheckId) return;
    if (!result) {
      this.usernameAvailability.set('error');
      return;
    }
    if (result.available) {
      this.usernameAvailability.set('available');
      this.clearUsernameTakenError();
      return;
    }
    this.usernameAvailability.set('taken');
    this.form.controls.username.setErrors({
      ...(this.form.controls.username.errors ?? {}),
      usernameTaken: true,
    });
  }

  private clearUsernameTakenError(): void {
    const errors = this.form.controls.username.errors;
    if (!errors?.['usernameTaken']) return;
    const { usernameTaken: _usernameTaken, ...nextErrors } = errors;
    this.form.controls.username.setErrors(Object.keys(nextErrors).length ? nextErrors : null);
  }
}
