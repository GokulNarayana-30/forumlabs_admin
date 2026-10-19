import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

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
        data: { roles: ['support', 'super_admin'] },
        loadChildren: () => import('./features/tickets/tickets.routes').then((m) => m.routes),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
