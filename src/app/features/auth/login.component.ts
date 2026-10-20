import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StaffStateService } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';

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
      // signIn never throws: it answers {session, error} (WR-15).
      const { session, error } = await this.authService.signIn(this.email(), this.password());
      if (error || !session) {
        this.errorMessage.set('Invalid email or password.');
        return;
      }

      const profile = await this.staffState.loadProfile();
      if (!profile.ok) {
        this.errorMessage.set(
          profile.status === 403
            ? 'This account has no staff access.'
            : 'Service unavailable, please try again shortly.',
        );
        await this.authService.signOut();
        return;
      }

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
        await this.router.navigateByUrl('/tickets');
      } else {
        await this.router.navigateByUrl('/no-access');
      }
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Sign-in failed, please try again.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
