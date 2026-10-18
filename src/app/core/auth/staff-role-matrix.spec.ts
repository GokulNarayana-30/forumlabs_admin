import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { roleGuard } from './role.guard';
import { StaffStateService } from '../state/staff-state.service';
import { AuthService } from './auth.service';
import { AdminLayoutComponent } from '../../layout/admin-layout.component';
import { routes } from '../../app.routes';

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
    expectedNavLabels: ['Bookings', 'Field / Collection', 'Catalog', 'Reports', 'Patient Search'],
    allowedRoutes: ['bookings', 'field', 'catalog', 'reports', 'patients'],
    deniedRoutes: [],
  },
  {
    role: 'booking_dispatch',
    expectedNavLabels: ['Bookings', 'Patient Search'],
    allowedRoutes: ['bookings', 'patients'],
    deniedRoutes: ['field', 'catalog', 'reports'],
  },
  {
    role: 'phlebotomist',
    expectedNavLabels: ['Field / Collection'],
    allowedRoutes: ['field'],
    deniedRoutes: ['bookings', 'catalog', 'reports', 'patients'],
  },
  {
    role: 'lab_staff',
    expectedNavLabels: ['Reports'],
    allowedRoutes: ['reports'],
    deniedRoutes: ['bookings', 'field', 'catalog', 'patients'],
  },
  {
    role: 'report_approver',
    expectedNavLabels: ['Reports'],
    allowedRoutes: ['reports'],
    deniedRoutes: ['bookings', 'field', 'catalog', 'patients'],
  },
  {
    role: 'catalog_manager',
    expectedNavLabels: ['Catalog'],
    allowedRoutes: ['catalog'],
    deniedRoutes: ['bookings', 'field', 'reports', 'patients'],
  },
  {
    role: 'support',
    expectedNavLabels: ['Patient Search'],
    allowedRoutes: ['patients'],
    deniedRoutes: ['bookings', 'field', 'catalog', 'reports'],
  },
  {
    role: 'finance',
    expectedNavLabels: [],
    allowedRoutes: [],
    deniedRoutes: ['bookings', 'field', 'catalog', 'reports', 'patients'],
  },
  {
    role: 'marketing',
    expectedNavLabels: [],
    allowedRoutes: [],
    deniedRoutes: ['bookings', 'field', 'catalog', 'reports', 'patients'],
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
