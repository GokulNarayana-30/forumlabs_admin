import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-no-access',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div
        class="w-full max-w-md bg-white rounded-2xl shadow-lg border border-surface-200 p-8 text-center"
      >
        <div
          class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 font-bold text-xl mb-4"
        >
          !
        </div>
        <h1 class="text-xl font-bold text-surface-900 tracking-tight mb-2">
          No Operational Access
        </h1>
        <p class="text-sm text-surface-600 mb-6 leading-relaxed">
          Your staff account has no active operational permissions in Forum Labs Operations Admin.
          Contact a super admin for role assignments.
        </p>
        <button
          type="button"
          (click)="signOut()"
          class="w-full py-2.5 px-4 rounded-xl font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm text-sm"
        >
          Sign Out
        </button>
      </div>
    </div>
  `,
})
export class NoAccessComponent {
  private readonly auth = inject(AuthService);

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
