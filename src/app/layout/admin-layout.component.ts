import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StaffStateService, StaffRole } from '../core/state/staff-state.service';
import { AuthService } from '../core/auth/auth.service';

export interface NavItem {
  label: string;
  path: string;
  roles: StaffRole[];
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-layout.component.html',
})
export class AdminLayoutComponent {
  private readonly staffState = inject(StaffStateService);
  private readonly auth = inject(AuthService);

  readonly displayName = this.staffState.displayName;
  readonly roles = this.staffState.roles;
  readonly currentUser = this.staffState.currentUser;

  private readonly allNavItems: NavItem[] = [
    { label: 'Bookings', path: '/bookings', roles: ['booking_dispatch', 'super_admin'] },
    { label: 'Field / Collection', path: '/field', roles: ['phlebotomist', 'super_admin'] },
    { label: 'Catalog', path: '/catalog', roles: ['catalog_manager', 'super_admin'] },
    { label: 'Reports', path: '/reports', roles: ['lab_staff', 'report_approver', 'super_admin'] },
    {
      label: 'Patient Search',
      path: '/patients',
      roles: ['support', 'booking_dispatch', 'super_admin'],
    },
    { label: 'Tickets', path: '/tickets', roles: ['support', 'super_admin'] },
    { label: 'Dispatch', path: '/dispatch', roles: ['booking_dispatch', 'super_admin'] },
    { label: 'Slots', path: '/slots', roles: ['booking_dispatch', 'super_admin'] },
    { label: 'Samples', path: '/samples', roles: ['lab_staff', 'booking_dispatch', 'super_admin'] },
    { label: 'Cash Close', path: '/finance/cash-close', roles: ['finance', 'super_admin'] },
    { label: 'Refunds', path: '/finance/refunds', roles: ['finance'] },
    { label: 'Members', path: '/members', roles: ['super_admin'] },
  ];

  readonly navItems = computed(() => {
    const userRoles = this.roles();
    const isSuperAdmin = userRoles.includes('super_admin');
    return this.allNavItems.filter((item) => {
      // Refunds nav requires explicit finance role, even for super_admin
      if (item.path === '/finance/refunds') {
        return userRoles.includes('finance');
      }
      if (isSuperAdmin) {
        return true;
      }
      return item.roles.some((r) => userRoles.includes(r));
    });
  });

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
