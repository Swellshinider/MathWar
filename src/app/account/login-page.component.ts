import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountAuthService } from './account-auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class LoginPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AccountAuthService);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
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
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const ok = await this.auth.login(
      this.form.controls.username.value,
      this.form.controls.password.value,
    );
    this.submitting.set(false);
    if (ok) await this.router.navigateByUrl(this.returnUrl());
  }

  private returnUrl(): string {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');
    return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account/settings';
  }
}
