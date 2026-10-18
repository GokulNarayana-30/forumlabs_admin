import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StaffStateService } from './staff-state.service';
import { ApiClient } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';

describe('StaffStateService (Reactive Role State)', () => {
  let service: StaffStateService;
  let mockApiClient: any;
  let mockAuthService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
    };

    mockAuthService = {
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    mockRouter = {
      navigateByUrl: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        StaffStateService,
        { provide: ApiClient, useValue: mockApiClient },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(StaffStateService);
  });

  it('initializes with empty signals', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.roles()).toEqual([]);
    expect(service.displayName()).toBe('');
  });

  it('loadProfile populates signals from GET /staff/me', async () => {
    mockApiClient.get.mockReturnValueOnce(
      of({
        staff_user_id: 'staff-uuid-1',
        name: 'Desk Operator',
        email: 'desk@forumlabs.invalid',
        roles: ['booking_dispatch', 'support'],
      }),
    );

    await service.loadProfile();

    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/me');
    expect(service.currentUser()?.staff_user_id).toBe('staff-uuid-1');
    expect(service.roles()).toEqual(['booking_dispatch', 'support']);
    expect(service.displayName()).toBe('Desk Operator');
  });

  it('hasRole matches granted roles or super_admin', () => {
    // Manually set state for test
    (service as any)._roles.set(['booking_dispatch']);

    expect(service.hasRole('booking_dispatch')).toBe(true);
    expect(service.hasRole('lab_staff')).toBe(false);
    expect(service.hasRole('lab_staff', 'booking_dispatch')).toBe(true);

    // super_admin matches everything
    (service as any)._roles.set(['super_admin']);
    expect(service.hasRole('lab_staff')).toBe(true);
    expect(service.hasRole('catalog_manager')).toBe(true);
  });

  it('clears state, signs out, and redirects to /login on profile load error', async () => {
    mockApiClient.get.mockReturnValueOnce(throwError(() => ({ status: 403, code: 'forbidden' })));

    await service.loadProfile();

    expect(service.currentUser()).toBeNull();
    expect(service.roles()).toEqual([]);
    expect(mockAuthService.signOut).toHaveBeenCalled();
  });
});
