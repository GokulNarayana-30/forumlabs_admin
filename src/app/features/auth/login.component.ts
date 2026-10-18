import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StaffStateService } from '../../core/state/staff-state.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly staffState = inject(StaffStateService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  async onSubmit(): Promise<void> {
    if (!this.email() || !this.password()) {
      this.errorMessage.set('Please enter both email and password.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signIn(this.email(), this.password());
      await this.staffState.loadProfile();

      const roles = this.staffState.roles();
      if (!roles || roles.length === 0) {
        await this.router.navigateByUrl('/no-access');
      } else if (roles.includes('super_admin') || roles.includes('booking_dispatch')) {
        await this.router.navigateByUrl('/bookings');
      } else if (roles.includes('phlebotomist')) {
        await this.router.navigateByUrl('/field');
      } else if (roles.includes('catalog_manager')) {
        await this.router.navigateByUrl('/catalog');
      } else if (roles.includes('lab_staff') || roles.includes('report_approver')) {
        await this.router.navigateByUrl('/reports');
      } else if (roles.includes('support')) {
        await this.router.navigateByUrl('/patients');
      } else {
        await this.router.navigateByUrl('/no-access');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid login credentials';
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
