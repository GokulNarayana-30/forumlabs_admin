import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { CouponsListComponent } from './coupons-list.component';
import { CouponsService, StaffCouponSummaryDto } from './coupons.service';

describe('CouponsListComponent', () => {
  let component: CouponsListComponent;
  let fixture: ComponentFixture<CouponsListComponent>;
  let mockCouponsService: {
    listCoupons: ReturnType<typeof vi.fn>;
    pauseCoupon: ReturnType<typeof vi.fn>;
    resumeCoupon: ReturnType<typeof vi.fn>;
    endCoupon: ReturnType<typeof vi.fn>;
  };

  const mockCoupons: StaffCouponSummaryDto[] = [
    {
      id: 'cpn-1',
      code: 'WELCOME100',
      title: 'First Order Discount',
      description: 'Flat Rs 100 off on your first order',
      kind: 'flat',
      value: 10000,
      max_discount_paise: null,
      min_amount_paise: 50000,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2026-12-31T23:59:59.000Z',
      applies_all: true,
      applies_item_ids: [],
      applies_category_ids: [],
      per_user_limit: 1,
      total_redemption_limit: 500,
      active: true,
      position: 0,
      redemption_count: 45,
    },
    {
      id: 'cpn-2',
      code: 'HEALTH20',
      title: 'Monsoon 20% Off',
      description: 'Get 20% off all tests',
      kind: 'percent',
      value: 20,
      max_discount_paise: 50000,
      min_amount_paise: 0,
      valid_from: '2026-06-01T00:00:00.000Z',
      valid_until: '2026-07-31T23:59:59.000Z',
      applies_all: true,
      applies_item_ids: [],
      applies_category_ids: [],
      per_user_limit: null,
      total_redemption_limit: null,
      active: false,
      position: 1,
      redemption_count: 120,
    },
  ];

  beforeEach(async () => {
    mockCouponsService = {
      listCoupons: vi.fn().mockReturnValue(of({ coupons: mockCoupons })),
      pauseCoupon: vi.fn(),
      resumeCoupon: vi.fn(),
      endCoupon: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CouponsListComponent],
      providers: [provideRouter([]), { provide: CouponsService, useValue: mockCouponsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CouponsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads coupons and displays formatted discounts and codes', () => {
    expect(mockCouponsService.listCoupons).toHaveBeenCalled();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]');
    expect(rows.length).toBe(2);

    expect(fixture.nativeElement.textContent).toContain('WELCOME100');
    expect(fixture.nativeElement.textContent).toContain('₹100 OFF');
    expect(fixture.nativeElement.textContent).toContain('Min ₹500');

    expect(fixture.nativeElement.textContent).toContain('HEALTH20');
    expect(fixture.nativeElement.textContent).toContain('20% OFF (up to ₹500)');
  });

  it('triggers search and filters coupons', () => {
    component.searchQuery.set('WELCOME');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]');
    expect(rows.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('WELCOME100');
    expect(fixture.nativeElement.textContent).not.toContain('HEALTH20');
  });

  it('toggles pause on active coupon', () => {
    mockCouponsService.pauseCoupon.mockReturnValue(of({ ...mockCoupons[0], active: false }));
    component.toggleActive(mockCoupons[0]);
    expect(mockCouponsService.pauseCoupon).toHaveBeenCalledWith('cpn-1');
  });

  it('displays confirmation before calling endCoupon', () => {
    mockCouponsService.endCoupon.mockReturnValue(
      of({ ...mockCoupons[0], valid_until: '2026-10-21T00:00:00.000Z' }),
    );

    // Request end opens confirmation dialog
    component.promptEndCoupon(mockCoupons[0]);
    expect(component.couponToEnd()).toBe(mockCoupons[0]);

    // Confirm end executes service call
    component.confirmEndCoupon();
    expect(mockCouponsService.endCoupon).toHaveBeenCalledWith('cpn-1');
    expect(component.couponToEnd()).toBeNull();
  });
  it('renders precise paise and Indian grouping in discounts, caps and minimums', () => {
    component.coupons.set([
      { ...mockCoupons[0], value: 50, min_amount_paise: 10050 },
      { ...mockCoupons[1], max_discount_paise: 125000000 },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('₹0.50 OFF');
    expect(fixture.nativeElement.textContent).toContain('Min ₹100.50');
    expect(fixture.nativeElement.textContent).toContain('20% OFF (up to ₹12,50,000)');
  });

  it('shows a 409 load error and retries instead of displaying an empty list', () => {
    component.coupons.set([]);
    mockCouponsService.listCoupons.mockReturnValue(
      throwError(() => new ApiClientError(409, 'failed', 'API 409')),
    );
    component.loadCoupons();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'API 409',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No coupons found');
    mockCouponsService.listCoupons.mockReturnValue(of({ coupons: mockCoupons }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.listCoupons).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
  });
  it('retains rows on a 409 action error and retries the failed pause', () => {
    mockCouponsService.pauseCoupon.mockReturnValue(
      throwError(() => new ApiClientError(409, 'failed', 'API 409')),
    );
    component.toggleActive(mockCoupons[0]);
    fixture.detectChanges();
    expect(component.coupons()).toEqual(mockCoupons);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('API 409');
    mockCouponsService.pauseCoupon.mockReturnValue(of({ ...mockCoupons[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.pauseCoupon.mock.calls).toEqual([
      [mockCoupons[0].id],
      [mockCoupons[0].id],
    ]);
    expect(component.coupons()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('shows a 422 load error and retries instead of displaying an empty list', () => {
    component.coupons.set([]);
    mockCouponsService.listCoupons.mockReturnValue(
      throwError(() => new ApiClientError(422, 'failed', 'API 422')),
    );
    component.loadCoupons();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'API 422',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No coupons found');
    mockCouponsService.listCoupons.mockReturnValue(of({ coupons: mockCoupons }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.listCoupons).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
  });
  it('retains rows on a 422 action error and retries the failed pause', () => {
    mockCouponsService.pauseCoupon.mockReturnValue(
      throwError(() => new ApiClientError(422, 'failed', 'API 422')),
    );
    component.toggleActive(mockCoupons[0]);
    fixture.detectChanges();
    expect(component.coupons()).toEqual(mockCoupons);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('API 422');
    mockCouponsService.pauseCoupon.mockReturnValue(of({ ...mockCoupons[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.pauseCoupon.mock.calls).toEqual([
      [mockCoupons[0].id],
      [mockCoupons[0].id],
    ]);
    expect(component.coupons()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('shows a 503 load error and retries instead of displaying an empty list', () => {
    component.coupons.set([]);
    mockCouponsService.listCoupons.mockReturnValue(
      throwError(() => new ApiClientError(503, 'failed', 'API 503')),
    );
    component.loadCoupons();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'Marketing is temporarily unavailable. Try again shortly.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No coupons found');
    mockCouponsService.listCoupons.mockReturnValue(of({ coupons: mockCoupons }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.listCoupons).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
  });
  it('retains rows on a 503 action error and retries the failed pause', () => {
    mockCouponsService.pauseCoupon.mockReturnValue(
      throwError(() => new ApiClientError(503, 'failed', 'API 503')),
    );
    component.toggleActive(mockCoupons[0]);
    fixture.detectChanges();
    expect(component.coupons()).toEqual(mockCoupons);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Marketing is temporarily unavailable. Try again shortly.');
    mockCouponsService.pauseCoupon.mockReturnValue(of({ ...mockCoupons[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.pauseCoupon.mock.calls).toEqual([
      [mockCoupons[0].id],
      [mockCoupons[0].id],
    ]);
    expect(component.coupons()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('keeps existing rows when reloading fails', () => {
    mockCouponsService.listCoupons.mockReturnValue(throwError(() => new Error('offline')));
    component.loadCoupons();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="coupon-row"]').length).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).not.toBeNull();
  });
  it('retries a failed resume with the same id', () => {
    mockCouponsService.resumeCoupon.mockReturnValue(
      throwError(() => new ApiClientError(422, 'invalid', 'Cannot resume')),
    );
    component.toggleActive(mockCoupons[1]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Cannot resume');
    mockCouponsService.resumeCoupon.mockReturnValue(of({ ...mockCoupons[1], active: true }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.resumeCoupon.mock.calls).toEqual([
      [mockCoupons[1].id],
      [mockCoupons[1].id],
    ]);
    expect(component.coupons()[1].active).toBe(true);
  });

  it('retains rows and confirmation on failed end, then retries the same coupon', () => {
    mockCouponsService.endCoupon.mockReturnValue(
      throwError(() => new ApiClientError(409, 'conflict', 'Cannot end')),
    );
    component.promptEndCoupon(mockCoupons[0]);
    component.confirmEndCoupon();
    fixture.detectChanges();
    expect(component.coupons()).toEqual(mockCoupons);
    expect(component.couponToEnd()).toBe(mockCoupons[0]);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Cannot end');
    mockCouponsService.endCoupon.mockReturnValue(
      of({ ...mockCoupons[0], valid_until: '2026-10-21T00:00:00Z' }),
    );
    component.cancelEndCoupon();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockCouponsService.endCoupon.mock.calls).toEqual([['cpn-1'], ['cpn-1']]);
    expect(component.couponToEnd()).toBeNull();
    expect(component.coupons()[0].valid_until).toBe('2026-10-21T00:00:00Z');
  });
});
