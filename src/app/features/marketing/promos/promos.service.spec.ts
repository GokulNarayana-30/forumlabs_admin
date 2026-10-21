import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from '../../../core/api/api-client.service';
import { environment } from '../../../../environments/environment';
import { PromosService, CreatePromoDto, UpdatePromoDto, PromoItem } from './promos.service';

describe('PromosService', () => {
  let service: PromosService;
  let httpMock: HttpTestingController;

  const mockPromo: PromoItem = {
    id: 'promo-001',
    placement: 'home_carousel',
    internal_name: 'Summer Health Check',
    eyebrow: 'Special Offer',
    headline: 'Comprehensive Full Body Checkup',
    body: 'Get 60+ vital tests with free home sample collection.',
    cta_label: 'Book Now',
    secondary_label: null,
    style: null,
    image_url: 'https://cdn.forumhospital.com/promos/checkup.png',
    target_kind: 'package',
    target_id: 'pkg-full-body',
    coupon_id: null,
    price_item_ids: ['item-cbc'],
    priority: 10,
    starts_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-06-30T23:59:59.000Z',
    active: true,
    status: 'live',
    frequency: 'once_per_day',
    frequency_days: null,
    max_impressions: null,
    created_at: '2026-05-15T10:00:00.000Z',
    updated_at: '2026-05-15T10:00:00.000Z',
    audience: { audience_mode: 'all' },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, PromosService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PromosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listPromos issues GET /staff/promos with optional filter params', () => {
    service.listPromos({ status: 'live' }).subscribe((res) => {
      expect(res.promos.length).toBe(1);
      expect(res.promos[0].id).toBe('promo-001');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('filter')).toBe('live');
    req.flush({ promos: [mockPromo] });
  });

  it('getPromo issues GET /staff/promos/:id', () => {
    service.getPromo('promo-001').subscribe((res) => {
      expect(res.id).toBe('promo-001');
      expect(res.headline).toBe('Comprehensive Full Body Checkup');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001'));
    expect(req.request.method).toBe('GET');
    req.flush(mockPromo);
  });

  it('createPromo issues POST /staff/promos with payload and idempotent header', () => {
    const createDto: CreatePromoDto = {
      placement: 'home_carousel',
      internal_name: 'Summer Health Check',
      headline: 'Comprehensive Full Body Checkup',
      body: 'Get 60+ vital tests with free home sample collection.',
      cta_label: 'Book Now',
      target_kind: 'package',
      target_id: 'pkg-full-body',
    };

    service.createPromo(createDto).subscribe((res) => {
      expect(res.id).toBe('promo-001');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.headline).toBe('Comprehensive Full Body Checkup');
    req.flush(mockPromo);
  });

  it('updatePromo issues PATCH /staff/promos/:id with payload and idempotent header', () => {
    const updateDto: UpdatePromoDto = {
      headline: 'Updated Checkup Title',
    };

    service.updatePromo('promo-001', updateDto).subscribe((res) => {
      expect(res.headline).toBe('Updated Checkup Title');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.headline).toBe('Updated Checkup Title');
    req.flush({ ...mockPromo, headline: 'Updated Checkup Title' });
  });

  it('pausePromo issues POST /staff/promos/:id/pause with idempotent header', () => {
    service.pausePromo('promo-001').subscribe((res) => {
      expect(res.active).toBe(false);
      expect(res.status).toBe('paused');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001/pause'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockPromo, active: false, status: 'paused' });
  });

  it('resumePromo issues POST /staff/promos/:id/resume with idempotent header', () => {
    service.resumePromo('promo-001').subscribe((res) => {
      expect(res.active).toBe(true);
      expect(res.status).toBe('live');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001/resume'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockPromo, active: true, status: 'live' });
  });

  it('duplicatePromo issues POST /staff/promos/:id/duplicate with idempotent header', () => {
    service.duplicatePromo('promo-001').subscribe((res) => {
      expect(res.id).toBe('promo-002');
      expect(res.internal_name).toBe('Summer Health Check (Copy)');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001/duplicate'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({
      ...mockPromo,
      id: 'promo-002',
      internal_name: 'Summer Health Check (Copy)',
      active: false,
    });
  });

  it('getStats issues GET /staff/promos/:id/stats', () => {
    service.getStats('promo-001').subscribe((res) => {
      expect(res.impressions).toBe(150);
      expect(res.clicks).toBe(12);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/promo-001/stats'));
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'promo-001',
      impressions: 150,
      clicks: 12,
      dismissals: 5,
      daily_breakdown: [{ date: '2026-06-15', impressions: 150, clicks: 12, dismissals: 5 }],
    });
  });

  it('previewPromo issues GET /staff/promos/preview with query params', () => {
    service
      .previewPromo({
        id: 'promo-001',
        audience_mode: 'signed_in',
        pincode: '560001',
      })
      .subscribe((res) => {
        expect(res.eligible).toBe(true);
      });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/promos/preview'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('id')).toBe('promo-001');
    expect(req.request.params.get('audience_mode')).toBe('signed_in');
    expect(req.request.params.get('pincode')).toBe('560001');
    req.flush({
      eligible: true,
      promo: mockPromo,
      banner: null,
      popup: null,
    });
  });
  it('reads selectable prices from the public catalog, without requiring catalog-manager role', () => {
    const items = [{ id: 'tst-cbc', name: 'CBC', mrp_paise: 19900, offer_price_paise: null }];
    service.getPriceItems().subscribe((result) => expect(result).toEqual(items));
    const req = httpMock.expectOne((r) => r.url.endsWith('/catalog/items'));
    expect(req.request.method).toBe('GET');
    req.flush(items);
  });
});
