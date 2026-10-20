import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, Route } from '@angular/router';
import { roleGuard } from './role.guard';
import { authGuard } from './auth.guard';
import { StaffStateService, StaffRole } from '../state/staff-state.service';
import { AuthService } from './auth.service';
import { routes } from '../../app.routes';

describe('authGuard & roleGuard', () => {
  let mockAuthService: any;
  let mockStaffState: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      getSession: vi.fn(),
    };

    mockStaffState = {
      hasRole: vi.fn(),
      roles: vi.fn().mockReturnValue([]),
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

  describe('authGuard', () => {
    it('permits navigation when session exists', () => {
      mockAuthService.getSession.mockReturnValue({ access_token: 'valid' });
      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toBe(true);
    });

    it('redirects to /login when session does not exist', () => {
      mockAuthService.getSession.mockReturnValue(null);
      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(result).toEqual({ path: '/login' });
    });
  });

  describe('roleGuard', () => {
    it('permits navigation when staff member has required role', () => {
      mockStaffState.hasRole.mockReturnValue(true);
      const route = { data: { roles: ['catalog_manager'] } } as unknown as ActivatedRouteSnapshot;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(route, {} as RouterStateSnapshot),
      );

      expect(mockStaffState.hasRole).toHaveBeenCalledWith('catalog_manager');
      expect(result).toBe(true);
    });

    it('redirects to /no-access when staff member lacks required role', () => {
      mockStaffState.hasRole.mockReturnValue(false);
      const route = { data: { roles: ['catalog_manager'] } } as unknown as ActivatedRouteSnapshot;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(route, {} as RouterStateSnapshot),
      );

      expect(mockStaffState.hasRole).toHaveBeenCalledWith('catalog_manager');
      expect(result).toEqual({ path: '/no-access' });
    });

    it('permits access if route has no specific role restrictions', () => {
      const route = { data: {} } as unknown as ActivatedRouteSnapshot;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(route, {} as RouterStateSnapshot),
      );

      expect(result).toBe(true);
    });
  });

  describe('Real Route Tree Security Boundaries', () => {
    const expectedRoutes: Record<string, StaffRole[]> = {
      bookings: ['booking_dispatch', 'super_admin'],
      field: ['phlebotomist', 'super_admin'],
      catalog: ['catalog_manager', 'super_admin'],
      reports: ['lab_staff', 'report_approver', 'super_admin'],
      patients: ['support', 'booking_dispatch', 'super_admin'],
    };

    /** Every problem with a route tree's protection; [] when it is sound. */
    function routeTreeProblems(tree: Route[]): string[] {
      const problems: string[] = [];
      const shellRoute = tree.find((r) => r.path === '' && r.children);
      if (!shellRoute) return ['no shell route'];
      if (!(shellRoute.canActivate ?? []).includes(authGuard))
        problems.push('shell route has no authGuard');
      for (const [path, expectedRoles] of Object.entries(expectedRoutes)) {
        const route = (shellRoute.children ?? []).find((r) => r.path === path);
        if (!route) {
          problems.push(`${path}: missing`);
          continue;
        }
        if (!(route.canActivate ?? []).includes(roleGuard)) problems.push(`${path}: no roleGuard`);
        const roles = [...((route.data?.['roles'] as string[] | undefined) ?? [])].sort();
        if (JSON.stringify(roles) !== JSON.stringify([...expectedRoles].sort())) {
          problems.push(`${path}: roles ${JSON.stringify(roles)}`);
        }
      }
      return problems;
    }

    it('enforces both authGuard and roleGuard and the exact roles on protected feature routes', () => {
      expect(routeTreeProblems(routes)).toEqual([]);
    });

    it('negative control: the same check reports a planted copy of the real tree with roleGuard removed or roles widened (IN-05)', () => {
      const shell = routes.find((r) => r.path === '' && r.children)!;
      const withoutGuard: Route[] = routes.map((r) =>
        r === shell
          ? {
              ...shell,
              children: shell.children!.map((c) =>
                c.path === 'catalog'
                  ? { ...c, canActivate: (c.canActivate ?? []).filter((g) => g !== roleGuard) }
                  : c,
              ),
            }
          : r,
      );
      const widened: Route[] = routes.map((r) =>
        r === shell
          ? {
              ...shell,
              children: shell.children!.map((c) =>
                c.path === 'reports'
                  ? { ...c, data: { ...c.data, roles: [...(c.data?.['roles'] ?? []), 'support'] } }
                  : c,
              ),
            }
          : r,
      );

      expect(routeTreeProblems(withoutGuard)).toEqual(['catalog: no roleGuard']);
      expect(routeTreeProblems(widened)).toHaveLength(1);
      expect(routeTreeProblems(widened)[0]).toContain('reports: roles');
    });

    it('ensures /no-access is reachable without redirect loop for authenticated staff', () => {
      mockAuthService.getSession.mockReturnValue({ access_token: 'valid' });
      const authResult = TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      expect(authResult).toBe(true);

      // No role check on /no-access
      const noAccessRoute = routes.find((r) => r.path === 'no-access');
      expect(noAccessRoute?.canActivate?.includes(roleGuard)).toBeFalsy();
    });
  });
});
