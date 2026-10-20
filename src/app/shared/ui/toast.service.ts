import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  severity?: 'success' | 'info' | 'warn' | 'error';
  summary?: string;
  detail?: string;
  /** Milliseconds before it disappears (default 5000). */
  life?: number;
}

export interface ToastItem extends ToastMessage {
  id: number;
}

/** Small messages in the corner of the screen. `add` has the same shape the old toast service had. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly items = signal<ToastItem[]>([]);

  add(message: ToastMessage): void {
    const id = this.nextId++;
    this.items.update((items) => [...items, { ...message, id }]);
    setTimeout(() => this.dismiss(id), message.life ?? 5000);
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}
