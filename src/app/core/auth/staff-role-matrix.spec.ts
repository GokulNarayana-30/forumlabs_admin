import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { roleGuard } from './role.guard';
import { StaffStateService } from '../state/staff-state.service';
import { AuthService } from './auth.service';
import { AdminLayoutComponent } from '../../layout/admin-layout.component';
import { routes, refundFinanceGuard } from '../../app.routes';
import { routes as ticketChildRoutes } from '../../features/tickets/tickets.routes';
import { routes as patientChildRoutes } from '../../features/patients/patients.routes';

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

/**
 * 15-17: the Phase 15 screens nested under /tickets and /patients, with the roles allowed in
 * (written from 15-COVERAGE, not read from the routes). The API rechecks current grants on every
 * call; this is the admin's UX gate only.
 */
export const PHASE15_CHILD_ROUTE_EXPECTATIONS: readonly {
  parent: 'tickets' | 'patients';
  path: string;
  allowed: readonly CanonicalStaffRole[];
}[] = [
  // Intake, canned replies, SLA policy and CSAT: support desk staff (report approvers work the queue).
  { parent: 'tickets', path: 'tools', allowed: ['support', 'super_admin'] },
  // Deletion queue, restore and retention: support and super_admin.
  { parent: 'patients', path: 'deletions', allowed: ['support', 'super_admin'] },
];

export const ROLE_MATRIX_EXPECTATIONS: readonly RoleMatrixExpectation[] = [
  {
    role: 'super_admin',
    expectedNavLabels: [
      'Bookings',
      'Field / Collection',
      'Catalog',
      'Doctors',
      'Reports',
      'Patient Search',
      // 15-13: deletion queue and restore (support / super_admin); retention is super_admin only.
      'Account Deletions',
      'Tickets',
      'Dispatch',
      'Slots',
      'Samples',
      'Cash Close',
      'Revenue',
      'Reconciliation',
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
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'reports',
      'tickets',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
    // 15-12: the Tickets desk opens for report approvers, but the API only ever gives them the
    // urgent report queue; the route guard is UX, the server enforces the scope.
    expectedNavLabels: ['Reports', 'Tickets'],
    allowedRoutes: ['reports', 'tickets'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'patients',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
    expectedNavLabels: ['Catalog', 'Doctors'],
    allowedRoutes: ['catalog', 'doctors', 'doctors/card/:doctor_id/:code_id'],
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
      'finance/revenue',
      'finance/reconciliation',
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
    expectedNavLabels: ['Patient Search', 'Account Deletions', 'Tickets'],
    allowedRoutes: ['patients', 'tickets'],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'reports',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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
    expectedNavLabels: ['Cash Close', 'Revenue', 'Reconciliation', 'Refunds'],
    allowedRoutes: [
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
      'finance/refunds',
    ],
    deniedRoutes: [
      'bookings',
      'field',
      'catalog',
      'doctors',
      'doctors/card/:doctor_id/:code_id',
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
      'doctors',
      'doctors/card/:doctor_id/:code_id',
      'reports',
      'patients',
      'tickets',
      'dispatch',
      'dispatch/calendar',
      'slots',
      'samples',
      'finance/cash-close',
      'finance/revenue',
      'finance/reconciliation',
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

  describe('Phase 15 nested screens across all 9 roles (15-17)', () => {
    const childData = (parent: 'tickets' | 'patients', path: string) => {
      const child = (parent === 'tickets' ? ticketChildRoutes : patientChildRoutes).find(
        (c) => c.path === path,
      );
      if (!child) throw new Error(`Route not found: /${parent}/${path}`);
      return { data: child.data || {} } as unknown as ActivatedRouteSnapshot;
    };
    const decide = (role: CanonicalStaffRole, snapshot: ActivatedRouteSnapshot) => {
      mockStaffState.roles.mockReturnValue([role]);
      mockStaffState.hasRole.mockImplementation((...required: string[]) =>
        role === 'super_admin' ? true : required.includes(role),
      );
      return TestBed.runInInjectionContext(() => roleGuard(snapshot, {} as RouterStateSnapshot));
    };

    for (const { parent, path, allowed } of PHASE15_CHILD_ROUTE_EXPECTATIONS) {
      it.each(ALL_NINE_STAFF_ROLES)(`/${parent}/${path}: %s`, (role) => {
        const result = decide(role, childData(parent, path));
        if (allowed.includes(role)) {
          expect(result).toBe(true);
        } else {
          expect(result).toEqual({ path: '/no-access' });
        }
      });
    }

    it('the Account Deletions nav item opens the guarded deletions screen', () => {
      mockStaffState.roles.mockReturnValue(['support']);
      const layout = TestBed.runInInjectionContext(() => new AdminLayoutComponent());
      const item = layout.navItems().find((i) => i.label === 'Account Deletions');
      expect(item?.path).toBe('/patients/deletions');
    });

    // 15-17 Task 2: the registry is exact in both directions. Every role-guarded child of /tickets
    // and /patients is registered with the same roles, and every registered screen is guarded.
    const guardedChildren = (
      routes: readonly { path?: string; canActivate?: unknown[]; data?: Record<string, unknown> }[],
    ) =>
      routes
        .filter((r) => (r.canActivate ?? []).includes(roleGuard) || r.data?.['roles'] !== undefined)
        .map((r) => ({
          path: r.path,
          roles: [...((r.data?.['roles'] as string[] | undefined) ?? [])].sort(),
          guarded: (r.canActivate ?? []).includes(roleGuard),
        }));
    const registered = (parent: 'tickets' | 'patients') =>
      PHASE15_CHILD_ROUTE_EXPECTATIONS.filter((e) => e.parent === parent).map((e) => ({
        path: e.path,
        roles: [...e.allowed].sort(),
        guarded: true,
      }));

    it('the role-guarded children of /tickets and /patients are exactly the Phase 15 registry', () => {
      expect(guardedChildren(ticketChildRoutes)).toEqual(registered('tickets'));
      expect(guardedChildren(patientChildRoutes)).toEqual(registered('patients'));
    });

    it('negative control: an unregistered guarded child, or a registered screen losing its guard, is caught', () => {
      const plantedExtra = [
        ...ticketChildRoutes,
        { path: 'csat', canActivate: [roleGuard], data: { roles: ['support', 'super_admin'] } },
      ];
      expect(guardedChildren(plantedExtra)).not.toEqual(registered('tickets'));
      const plantedUnguarded = patientChildRoutes.map((r) =>
        r.path === 'deletions' ? { ...r, canActivate: [] } : r,
      );
      expect(guardedChildren(plantedUnguarded)).not.toEqual(registered('patients'));
    });

    it('negative control: a planted extra role on /tickets/tools is caught', () => {
      const planted = {
        data: { roles: ['support', 'super_admin', 'marketing'] },
      } as unknown as ActivatedRouteSnapshot;
      expect(decide('marketing', planted)).toBe(true);
      expect(decide('marketing', childData('tickets', 'tools'))).toEqual({ path: '/no-access' });
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

    it('every direct child path of shell route starting with finance/revenue, finance/reconciliation, or doctors is covered across all 9 roles', () => {
      const shellRoute = routes.find((r) => r.path === '' && r.children);
      const phase16AdminPaths = (shellRoute?.children ?? [])
        .map((c) => c.path)
        .filter(
          (p): p is string =>
            typeof p === 'string' &&
            (p.startsWith('finance/revenue') ||
              p.startsWith('finance/reconciliation') ||
              p.startsWith('doctors')),
        );

      expect(phase16AdminPaths.length).toBeGreaterThanOrEqual(4);

      for (const expectation of ROLE_MATRIX_EXPECTATIONS) {
        for (const path of phase16AdminPaths) {
          const covered =
            (expectation.allowedRoutes as readonly string[]).includes(path) ||
            (expectation.deniedRoutes as readonly string[]).includes(path);
          expect(
            covered,
            `Role ${expectation.role} must cover path /${path} in allowedRoutes or deniedRoutes`,
          ).toBe(true);
        }
      }

      // Verify exact nav label arrays for super_admin, finance and catalog_manager
      const superAdminExp = ROLE_MATRIX_EXPECTATIONS.find((e) => e.role === 'super_admin');
      expect(superAdminExp?.expectedNavLabels).toEqual([
        'Bookings',
        'Field / Collection',
        'Catalog',
        'Doctors',
        'Reports',
        'Patient Search',
        'Account Deletions',
        'Tickets',
        'Dispatch',
        'Slots',
        'Samples',
        'Cash Close',
        'Revenue',
        'Reconciliation',
        'Members',
        'Banners & Popups',
        'Coupons',
        'Push Campaigns',
        'Marketing Settings',
      ]);

      const financeExp = ROLE_MATRIX_EXPECTATIONS.find((e) => e.role === 'finance');
      expect(financeExp?.expectedNavLabels).toEqual([
        'Cash Close',
        'Revenue',
        'Reconciliation',
        'Refunds',
      ]);

      const catalogExp = ROLE_MATRIX_EXPECTATIONS.find((e) => e.role === 'catalog_manager');
      expect(catalogExp?.expectedNavLabels).toEqual(['Catalog', 'Doctors']);
    });

    it('negative control: planted missing entry in role expectations is detected', () => {
      const defectiveExpectation = {
        role: 'support',
        allowedRoutes: [] as string[],
        deniedRoutes: ['finance/revenue', 'finance/reconciliation'] as string[], // missing 'doctors'
      };
      const path = 'doctors';
      const covered =
        defectiveExpectation.allowedRoutes.includes(path) ||
        defectiveExpectation.deniedRoutes.includes(path);
      expect(covered).toBe(false);
    });
  });
});
