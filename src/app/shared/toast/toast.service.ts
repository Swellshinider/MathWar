import { Injectable, signal } from '@angular/core';

export interface Toast {
  readonly id: string;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly autoDismissMs = 3000;
  readonly toasts = signal<readonly Toast[]>([]);

  show(message: string): void {
    const id = crypto.randomUUID();
    this.toasts.update((current) => [...current, { id, message }]);
    setTimeout(() => this.dismiss(id), this.autoDismissMs);
  }

  dismiss(id: string): void {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }
}
