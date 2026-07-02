import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountAuthService } from './account-auth.service';

@Component({
  selector: 'app-create-account-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class CreateAccountPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly auth = inject(AccountAuthService);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const ok = await this.auth.register(
      this.form.controls.email.value,
      this.form.controls.password.value,
      this.form.controls.displayName.value,
    );
    this.submitting.set(false);
    if (ok) await this.router.navigateByUrl('/account/settings');
  }
}
