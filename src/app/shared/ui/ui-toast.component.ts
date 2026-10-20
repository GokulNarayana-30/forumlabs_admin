import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

const LOOKS: Record<string, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

/** Shows the ToastService messages. Placed once in the app root. */
@Component({
  selector: 'ui-toast',
  standalone: true,
  template: `
    <div
      class="pointer-events-none fixed right-3 top-3 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      @for (item of toasts.items(); track item.id) {
        <div
          [attr.role]="item.severity === 'error' ? 'alert' : 'status'"
          [class]="
            'pointer-events-auto rounded-xl border p-3 text-sm shadow-lg ' + look(item.severity)
          "
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              @if (item.summary) {
                <div class="font-semibold">{{ item.summary }}</div>
              }
              @if (item.detail) {
                <div class="break-words">{{ item.detail }}</div>
              }
            </div>
            <button
              type="button"
              aria-label="Dismiss message"
              class="shrink-0 rounded px-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              (click)="toasts.dismiss(item.id)"
            >
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class UiToastComponent {
  protected readonly toasts = inject(ToastService);

  protected look(severity: string | undefined): string {
    return LOOKS[severity ?? 'info'] ?? LOOKS['info']!;
  }
}
