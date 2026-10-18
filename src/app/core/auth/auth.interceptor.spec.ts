import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor (Origin-Scoped Token Security)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let mockAuthService: any;

  beforeEach(() => {
    mockAuthService = {
      getSession: vi.fn().mockReturnValue({ access_token: 'valid-staff-jwt-token' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches Bearer token to configured API URL and relative /v1 path', () => {
    // 1. Configured base URL
    http.get('http://localhost:3000/v1/staff/orders').subscribe();
    const req1 = httpMock.expectOne('http://localhost:3000/v1/staff/orders');
    expect(req1.request.headers.get('Authorization')).toBe('Bearer valid-staff-jwt-token');
    req1.flush({});

    // 2. Relative /v1 path
    http.get('/v1/staff/me').subscribe();
    const req2 = httpMock.expectOne('/v1/staff/me');
    expect(req2.request.headers.get('Authorization')).toBe('Bearer valid-staff-jwt-token');
    req2.flush({});
  });

  it('does NOT attach Bearer token to foreign origins', () => {
    http.get('https://evil.invalid/v1/staff/orders').subscribe();
    const req = httpMock.expectOne('https://evil.invalid/v1/staff/orders');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does NOT attach Bearer token to deceptive host prefixes', () => {
    http.get('http://localhost:3000.evil.com/v1/staff/orders').subscribe();
    const req = httpMock.expectOne('http://localhost:3000.evil.com/v1/staff/orders');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does NOT attach Bearer token to unconfigured subpaths such as /v10 or /other', () => {
    http.get('http://localhost:3000/v10/staff/orders').subscribe();
    const req1 = httpMock.expectOne('http://localhost:3000/v10/staff/orders');
    expect(req1.request.headers.has('Authorization')).toBe(false);
    req1.flush({});

    http.get('http://localhost:3000/other/api').subscribe();
    const req2 = httpMock.expectOne('http://localhost:3000/other/api');
    expect(req2.request.headers.has('Authorization')).toBe(false);
    req2.flush({});
  });

  it('intercepts 401 Unauthorized response and triggers authService.signOut()', () => {
    http.get('http://localhost:3000/v1/staff/orders').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('http://localhost:3000/v1/staff/orders');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.signOut).toHaveBeenCalled();
  });
});
