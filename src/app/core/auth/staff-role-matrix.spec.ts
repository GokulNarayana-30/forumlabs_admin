import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { roleGuard } from './role.guard';
import { StaffStateService } from '../state/staff-state.service';
import { AuthService } from './auth.service';
import { AdminLayoutComponent } from '../../layout/admin-layout.component';
import { routes, refundFinanceGuard } from '../../app.routes';

export const ALL_NINE_STAFF_ROLES = [
  'super_admin',
  'booking_dispatch',
  'phlebotomist',
  'lab_staff',
  'report_approver',
  'catalog_manager',
  'support',
  'finance',
  'marketing',
] as const;

export type CanonicalStaffRole = (typeof ALL_NINE_STAFF_ROLES)[number];

export interface RoleMatrixExpectation {
  role: CanonicalStaffRole;
  expectedNavLabels: string[];
  allowedRoutes: string[];
  deniedRoutes: string[];
}

export const ROLE_MATRIX_EXPECTATIONS: readonly RoleMatrixExpectation[] = [
  {
    role: 'super_admin',
    expectedNavLabels: [
      'Bookings',
      'Field / Collection',
      'Catalog',
      'Reports',
      'Patient Search',
      'Tickets',
      'Dispatch',
      'Slots',
      'Samples',
      'Cash Close',
      'Members',
      'Banners & Popups',
      'Coupons',
      'Push Campaigns',
      'Marketing Settings',
    ],
    allowedRoutes: [
      'bookings',
      'field',
      'catalog',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
    deniedRoutes: [],
  },
  {
    role: 'booking_dispatch',
    expectedNavLabels: ['Bookings', 'Patient Search', 'Dispatch', 'Slots', 'Samples'],
    allowedRoutes: ['bookings', 'patients', 'dispatch', 'dispatch/calendar', 'slots', 'samples'],
    deniedRoutes: [
      'field',
      'catalog',
      'reports',
      'tickets',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'phlebotomist',
    expectedNavLabels: ['Field / Collection'],
    allowedRoutes: ['field'],
    deniedRoutes: [
      'bookings',
      'catalog',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'lab_staff',
    expectedNavLabels: ['Reports', 'Samples'],
    allowedRoutes: ['reports', 'samples'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'report_approver',
    expectedNavLabels: ['Reports'],
    allowedRoutes: ['reports'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'catalog_manager',
    expectedNavLabels: ['Catalog'],
    allowedRoutes: ['catalog'],
    deniedRoutes: [
      'bookings',
      'field',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'support',
    expectedNavLabels: ['Patient Search', 'Tickets'],
    allowedRoutes: ['patients', 'tickets'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'reports',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'finance',
    expectedNavLabels: ['Cash Close', 'Refunds'],
    allowedRoutes: ['finance/cash-close', 'finance/refunds'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'members',
      'marketing/promos',
      'marketing/coupons',
      'marketing/campaigns',
      'marketing/settings',
    ],
  },
  {
    role: 'marketing',
    expectedNavLabels: ['Banners & Popups', 'Coupons', 'Push Campaigns'],
    allowedRoutes: ['marketing/promos', 'marketing/coupons', 'marketing/campaigns'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/refunds',
      'members',
      'marketing/settings',
    ],
  },
];

describe('Admin Staff Role Matrix (All 9 Roles) (W-08)', () => {
  let mockAuthService: any;
  let mockStaffState: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      getSession: vi.fn().mockReturnValue({ access_token: 'valid' }),
      signOut: vi.fn(),
    };

    mockStaffState = {
      hasRole: vi.fn(),
      roles: vi.fn().mockReturnValue([]),
      displayName: vi.fn().mockReturnValue('Test Staff'),
      currentUser: vi.fn().mockReturnValue(null),
    };

    mockRouter = {
      createUrlTree: vi.fn().mockImplementation((commands) => ({ path: commands.join('/') })),
      navigateByUrl: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: StaffStateService, useValue: mockStaffState },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  const getRouteConfig = (path: string): ActivatedRouteSnapshot => {
    const shellRoute = routes.find((r) => r.path === '' && r.children);
    const child = shellRoute?.children?.find((c) => c.path === path);
    if (!child) throw new Error(`Route not found for path: ${path}`);
    return {
      data: child.data || {},
    } as unknown as ActivatedRouteSnapshot;
  };

  describe.each(ROLE_MATRIX_EXPECTATIONS)(
    'Role: $role',
    ({ role, expectedNavLabels, allowedRoutes, deniedRoutes }) => {
      it(`renders navigation menu with labels: [${expectedNavLabels.join(', ')}]`, () => {
        mockStaffState.roles.mockReturnValue([role]);

        const layout = TestBed.runInInjectionContext(() => new AdminLayoutComponent());
        const navLabels = layout.navItems().map((item) => item.label);
        expect(navLabels).toEqual(expectedNavLabels);
      });

      if (allowedRoutes.length > 0) {
        it.each(allowedRoutes)(`allows access to route /%s`, (path) => {
          mockStaffState.roles.mockReturnValue([role]);
          mockStaffState.hasRole.mockImplementation((...required: string[]) => {
            if (role === 'super_admin') return true;
            return required.includes(role);
          });

          const snapshot = getRouteConfig(path);
          const result = TestBed.runInInjectionContext(() =>
            roleGuard(snapshot, {} as RouterStateSnapshot),
          );
          expect(result).toBe(true);
        });
      }

      if (deniedRoutes.length > 0) {
        it.each(deniedRoutes)(`denies access to route /%s and redirects to /no-access`, (path) => {
          mockStaffState.roles.mockReturnValue([role]);
          mockStaffState.hasRole.mockImplementation((...required: string[]) => {
            if (role === 'super_admin') return true;
            return required.includes(role);
          });

          const snapshot = getRouteConfig(path);
          const result = TestBed.runInInjectionContext(() =>
            roleGuard(snapshot, {} as RouterStateSnapshot),
          );
          expect(result).toEqual({ path: '/no-access' });
        });
      }
    },
  );

  describe('Refunds route finance guard (refundFinanceGuard)', () => {
    it('denies super_admin who does not hold the finance role', () => {
      mockStaffState.roles.mockReturnValue(['super_admin']);
      const result = TestBed.runInInjectionContext(() =>
        refundFinanceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toEqual({ path: '/no-access' });
    });

    it('allows staff with the finance role', () => {
      mockStaffState.roles.mockReturnValue(['finance']);
      const result = TestBed.runInInjectionContext(() =>
        refundFinanceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toBe(true);
    });

    it('allows super_admin who also holds the finance role', () => {
      mockStaffState.roles.mockReturnValue(['super_admin', 'finance']);
      const result = TestBed.runInInjectionContext(() =>
        refundFinanceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toBe(true);
    });

    it('denies other staff roles without finance', () => {
      mockStaffState.roles.mockReturnValue(['booking_dispatch', 'support']);
      const result = TestBed.runInInjectionContext(() =>
        refundFinanceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toEqual({ path: '/no-access' });
    });
  });

  describe('Negative controls on role matrix logic', () => {
    it('rejects navigation if route requires role not held by staff member', () => {
      mockStaffState.hasRole.mockReturnValue(false);
      const snapshot = getRouteConfig('bookings');
      const result = TestBed.runInInjectionContext(() =>
        roleGuard(snapshot, {} as RouterStateSnapshot),
      );
      expect(result).toEqual({ path: '/no-access' });
    });

    it('verifies all 9 roles are covered in matrix definitions', () => {
      const coveredRoles = ROLE_MATRIX_EXPECTATIONS.map((e) => e.role);
      expect(coveredRoles).toHaveLength(9);
      for (const role of ALL_NINE_STAFF_ROLES) {
        expect(coveredRoles).toContain(role);
      }
    });
  });
});
