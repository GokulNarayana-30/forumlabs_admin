import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { StaffStateService } from './core/state/staff-state.service';

export const refundFinanceGuard: CanActivateFn = () => {
  const staffState = inject(StaffStateService);
  const router = inject(Router);
  if (staffState.roles().includes('finance')) {
    return true;
  }
  return router.createUrlTree(['/no-access']);
};

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'no-access',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/no-access.component').then((m) => m.NoAccessComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'bookings',
      },
      {
        path: 'bookings',
        canActivate: [roleGuard],
        data: { roles: ['booking_dispatch', 'super_admin'] },
        loadChildren: () => import('./features/bookings/bookings.routes').then((m) => m.routes),
      },
      {
        path: 'dispatch',
        canActivate: [roleGuard],
        data: { roles: ['booking_dispatch'] },
        loadComponent: () =>
          import('./features/dispatch/dispatch-today.component').then(
            (m) => m.DispatchTodayComponent,
          ),
      },
      {
        path: 'dispatch/calendar',
        canActivate: [roleGuard],
        data: { roles: ['booking_dispatch'] },
        loadComponent: () =>
          import('./features/dispatch/dispatch-calendar.component').then(
            (m) => m.DispatchCalendarComponent,
          ),
      },
      {
        path: 'slots',
        canActivate: [roleGuard],
        data: { roles: ['booking_dispatch'] },
        loadComponent: () =>
          import('./features/slots/slots-calendar.component').then((m) => m.SlotsCalendarComponent),
      },
      {
        path: 'samples',
        canActivate: [roleGuard],
        data: { roles: ['lab_staff', 'booking_dispatch'] },
        loadComponent: () =>
          import('./features/samples/lab-receipt.component').then((m) => m.LabReceiptComponent),
      },
      {
        path: 'finance/cash-close',
        canActivate: [roleGuard],
        data: { roles: ['finance'] },
        loadComponent: () =>
          import('./features/finance/cash-close-daily.component').then(
            (m) => m.CashCloseDailyComponent,
          ),
      },
      {
        path: 'finance/revenue',
        canActivate: [roleGuard],
        data: { roles: ['finance'] },
        loadComponent: () =>
          import('./features/finance/revenue/revenue-page.component').then(
            (m) => m.RevenuePageComponent,
          ),
      },
      {
        path: 'finance/reconciliation',
        canActivate: [roleGuard],
        data: { roles: ['finance'] },
        loadComponent: () =>
          import('./features/finance/revenue/reconciliation-page.component').then(
            (m) => m.ReconciliationPageComponent,
          ),
      },
      {
        path: 'finance/refunds',
        canActivate: [roleGuard, refundFinanceGuard],
        data: { roles: ['finance'] },
        loadComponent: () =>
          import('./features/finance/refunds-list.component').then((m) => m.RefundsListComponent),
      },
      {
        path: 'members',
        canActivate: [roleGuard],
        data: { roles: ['super_admin'] },
        loadComponent: () =>
          import('./features/members/members-list.component').then((m) => m.MembersListComponent),
      },
      {
        path: 'field',
        canActivate: [roleGuard],
        data: { roles: ['phlebotomist', 'super_admin'] },
        loadChildren: () => import('./features/field/field.routes').then((m) => m.routes),
      },
      {
        path: 'catalog',
        canActivate: [roleGuard],
        data: { roles: ['catalog_manager', 'super_admin'] },
        loadChildren: () => import('./features/catalog/catalog.routes').then((m) => m.routes),
      },
      {
        path: 'doctors',
        canActivate: [roleGuard],
        data: { roles: ['catalog_manager'] },
        loadComponent: () =>
          import('./features/doctors/doctors-page.component').then((m) => m.DoctorsPageComponent),
      },
      {
        path: 'doctors/card/:doctor_id/:code_id',
        canActivate: [roleGuard],
        data: { roles: ['catalog_manager'] },
        loadComponent: () =>
          import('./features/doctors/opd-card.component').then((m) => m.OpdCardComponent),
      },
      {
        path: 'reports',
        canActivate: [roleGuard],
        data: { roles: ['lab_staff', 'report_approver', 'super_admin'] },
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.routes),
      },
      {
        path: 'patients',
        canActivate: [roleGuard],
        data: { roles: ['support', 'booking_dispatch', 'super_admin'] },
        loadChildren: () => import('./features/patients/patients.routes').then((m) => m.routes),
      },
      {
        path: 'tickets',
        canActivate: [roleGuard],
        data: { roles: ['support', 'report_approver', 'super_admin'] },
        loadChildren: () => import('./features/tickets/tickets.routes').then((m) => m.routes),
      },
      {
        path: 'marketing/promos',
        canActivate: [roleGuard],
        data: { roles: ['marketing', 'super_admin'] },
        loadChildren: () =>
          import('./features/marketing/promos/promos.routes').then((m) => m.routes),
      },
      {
        path: 'marketing/coupons',
        canActivate: [roleGuard],
        data: { roles: ['marketing', 'super_admin'] },
        loadChildren: () =>
          import('./features/marketing/coupons/coupons.routes').then((m) => m.routes),
      },
      {
        path: 'marketing/campaigns',
        canActivate: [roleGuard],
        data: { roles: ['marketing', 'super_admin'] },
        loadChildren: () =>
          import('./features/marketing/campaigns/campaigns.routes').then((m) => m.routes),
      },
      {
        path: 'marketing/settings',
        canActivate: [roleGuard],
        data: { roles: ['super_admin'] },
        loadComponent: () =>
          import('./features/marketing/settings/marketing-settings.component').then(
            (m) => m.MarketingSettingsComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
