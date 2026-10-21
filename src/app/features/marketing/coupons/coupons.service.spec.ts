import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CouponsService,
  CreateCouponDto,
  UpdateCouponDto,
  StaffCouponSummaryDto,
  StaffCouponDetailDto,
} from './coupons.service';

describe('CouponsService', () => {
  let service: CouponsService;
  let httpMock: HttpTestingController;

  const mockCouponSummary: StaffCouponSummaryDto = {
    id: 'cpn-001',
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
    redemption_count: 42,
  };

  const mockCouponDetail: StaffCouponDetailDto = {
    ...mockCouponSummary,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by: 'staff-user-1',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, CouponsService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(CouponsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listCoupons issues GET /staff/coupons', () => {
    service.listCoupons({ search: 'WELCOME' }).subscribe((res) => {
      expect(res.coupons.length).toBe(1);
      expect(res.coupons[0].code).toBe('WELCOME100');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('search')).toBe('WELCOME');
    req.flush({ coupons: [mockCouponSummary] });
  });

  it('getCoupon issues GET /staff/coupons/:id', () => {
    service.getCoupon('cpn-001').subscribe((res) => {
      expect(res.id).toBe('cpn-001');
      expect(res.code).toBe('WELCOME100');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons/cpn-001'));
    expect(req.request.method).toBe('GET');
    req.flush(mockCouponDetail);
  });

  it('createCoupon issues POST /staff/coupons with payload and idempotent header', () => {
    const createDto: CreateCouponDto = {
      code: 'HEALTH20',
      title: 'Monsoon 20% Off',
      description: 'Get 20% off all tests',
      kind: 'percent',
      value: 20,
      maxDiscountPaise: 50000,
      minAmountPaise: 0,
      appliesAll: true,
      perUserLimit: 1,
    };

    service.createCoupon(createDto).subscribe((res) => {
      expect(res.id).toBe('cpn-002');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.code).toBe('HEALTH20');
    req.flush({ ...mockCouponDetail, id: 'cpn-002', code: 'HEALTH20' });
  });

  it('updateCoupon issues PATCH /staff/coupons/:id with payload and idempotent header', () => {
    const updateDto: UpdateCouponDto = {
      title: 'Updated 20% Off Title',
    };

    service.updateCoupon('cpn-001', updateDto).subscribe((res) => {
      expect(res.title).toBe('Updated 20% Off Title');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons/cpn-001'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.title).toBe('Updated 20% Off Title');
    req.flush({ ...mockCouponDetail, title: 'Updated 20% Off Title' });
  });

  it('pauseCoupon issues POST /staff/coupons/:id/pause with idempotent header', () => {
    service.pauseCoupon('cpn-001').subscribe((res) => {
      expect(res.active).toBe(false);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons/cpn-001/pause'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCouponDetail, active: false });
  });

  it('resumeCoupon issues POST /staff/coupons/:id/resume with idempotent header', () => {
    service.resumeCoupon('cpn-001').subscribe((res) => {
      expect(res.active).toBe(true);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons/cpn-001/resume'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCouponDetail, active: true });
  });

  it('endCoupon issues POST /staff/coupons/:id/end with idempotent header', () => {
    service.endCoupon('cpn-001').subscribe((res) => {
      expect(res.valid_until).toBeTruthy();
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/coupons/cpn-001/end'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCouponDetail, valid_until: '2026-10-21T00:00:00.000Z' });
  });
});
