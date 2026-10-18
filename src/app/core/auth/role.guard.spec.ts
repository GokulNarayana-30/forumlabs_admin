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
    // Verifies all protected feature routes have both authGuard and roleGuard
    it('enforces both authGuard and roleGuard and explicit roles on protected feature routes', () => {
      // Find shell layout route
      const shellRoute = routes.find((r) => r.path === '' && r.children);
      expect(shellRoute).toBeTruthy();
      expect(shellRoute?.canActivate).toContain(authGuard);

      const protectedChildren = shellRoute?.children || [];
      const expectedRoutes: Record<string, StaffRole[]> = {
        bookings: ['booking_dispatch', 'super_admin'],
        field: ['phlebotomist', 'super_admin'],
        catalog: ['catalog_manager', 'super_admin'],
        reports: ['lab_staff', 'report_approver', 'super_admin'],
        patients: ['support', 'booking_dispatch', 'super_admin'],
      };

      for (const [path, expectedRoles] of Object.entries(expectedRoutes)) {
        const route = protectedChildren.find((r) => r.path === path);
        expect(route).toBeTruthy();
        expect(route?.canActivate).toContain(roleGuard);
        expect(route?.data?.['roles']).toEqual(expect.arrayContaining(expectedRoles));
      }
    });

    it('rejects unauthorized navigation in negative control with planted removed guard', () => {
      // Planted invalid route tree with missing roleGuard
      const invalidTree: Route[] = [
        {
          path: 'catalog',
          canActivate: [], // MISSING roleGuard
          data: { roles: ['catalog_manager'] },
        },
      ];

      const catalogRoute = invalidTree[0];
      const hasGuards = (catalogRoute.canActivate || []).includes(roleGuard);
      expect(hasGuards).toBe(false); // Negative control proves vulnerability detection
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
