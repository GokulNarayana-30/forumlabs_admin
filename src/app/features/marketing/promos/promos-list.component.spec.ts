import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { PromosListComponent } from './promos-list.component';
import { PromosService, PromoItem } from './promos.service';

describe('PromosListComponent', () => {
  let component: PromosListComponent;
  let fixture: ComponentFixture<PromosListComponent>;
  let mockPromosService: {
    getStats: ReturnType<typeof vi.fn>;
    listPromos: ReturnType<typeof vi.fn>;
    pausePromo: ReturnType<typeof vi.fn>;
    resumePromo: ReturnType<typeof vi.fn>;
    duplicatePromo: ReturnType<typeof vi.fn>;
  };

  const mockPromos: PromoItem[] = [
    {
      id: 'promo-1',
      placement: 'home_carousel',
      internal_name: 'Diabetic Screening',
      eyebrow: 'Featured',
      headline: 'Complete Diabetes Check',
      body: 'HbA1c and fasting blood sugar',
      cta_label: 'Book Now',
      secondary_label: null,
      style: null,
      image_url: 'https://cdn.forumhospital.com/promo1.png',
      target_kind: 'package',
      target_id: 'pkg-dia',
      coupon_id: null,
      price_item_ids: [],
      priority: 5,
      starts_at: '2026-06-01T00:00:00.000Z',
      ends_at: '2026-06-30T23:59:59.000Z',
      active: true,
      status: 'live',
      frequency: 'once_per_day',
      frequency_days: null,
      max_impressions: null,
      created_at: '2026-05-15T10:00:00.000Z',
      updated_at: '2026-05-15T10:00:00.000Z',
    },
    {
      id: 'promo-2',
      placement: 'home_popup',
      internal_name: 'Monsoon Discount',
      eyebrow: null,
      headline: 'Flat 20% Off All Health Packages',
      body: 'Stay safe this monsoon.',
      cta_label: 'Claim Offer',
      secondary_label: 'Maybe Later',
      style: null,
      image_url: null,
      target_kind: 'coupon',
      target_id: 'cpn-monsoon',
      coupon_id: 'cpn-monsoon',
      price_item_ids: [],
      priority: 8,
      starts_at: '2026-07-01T00:00:00.000Z',
      ends_at: '2026-07-31T23:59:59.000Z',
      active: false,
      status: 'paused',
      frequency: 'once_every_n_days',
      frequency_days: 7,
      max_impressions: 3,
      created_at: '2026-06-01T10:00:00.000Z',
      updated_at: '2026-06-01T10:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    mockPromosService = {
      getStats: vi.fn().mockImplementation((id: string) =>
        of({
          id,
          impressions: id === 'promo-1' ? 200 : 0,
          clicks: id === 'promo-1' ? 15 : 0,
          dismissals: 0,
          daily_breakdown: [],
        }),
      ),
      listPromos: vi.fn().mockReturnValue(of({ promos: mockPromos })),
      pausePromo: vi.fn(),
      resumePromo: vi.fn(),
      duplicatePromo: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PromosListComponent],
      providers: [provideRouter([]), { provide: PromosService, useValue: mockPromosService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PromosListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes and renders promotion list items', () => {
    expect(mockPromosService.listPromos).toHaveBeenCalled();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Complete Diabetes Check');
    expect(fixture.nativeElement.textContent).toContain('Flat 20% Off All Health Packages');
  });

  it('filters rows when switching tabs (Carousel vs Popup)', () => {
    component.setTab('home_carousel');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]');
    expect(rows.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Complete Diabetes Check');
    expect(fixture.nativeElement.textContent).not.toContain('Flat 20% Off All Health Packages');

    component.setTab('home_popup');
    fixture.detectChanges();

    const popupRows = fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]');
    expect(popupRows.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Flat 20% Off All Health Packages');
  });

  it('toggles pause on live promo when action button clicked', () => {
    const updated = { ...mockPromos[0], active: false, status: 'paused' as const };
    mockPromosService.pausePromo.mockReturnValue(of(updated));

    component.toggleActive(mockPromos[0]);
    expect(mockPromosService.pausePromo).toHaveBeenCalledWith('promo-1');
  });

  it('duplicates promo when duplicate button clicked', () => {
    const duplicate = {
      ...mockPromos[0],
      id: 'promo-1-copy',
      internal_name: 'Diabetic Screening (Copy)',
      active: false,
      status: 'paused' as const,
    };
    mockPromosService.duplicatePromo.mockReturnValue(of(duplicate));

    component.duplicatePromo(mockPromos[0]);
    expect(mockPromosService.duplicatePromo).toHaveBeenCalledWith('promo-1');
  });
  it('fetches and renders actual performance with zero-safe CTR', () => {
    expect(mockPromosService.getStats.mock.calls).toEqual([['promo-1'], ['promo-2']]);
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]');
    expect(rows[0].querySelector('[data-testid="impressions"]').textContent).toContain('200');
    expect(rows[0].querySelector('[data-testid="clicks"]').textContent).toContain('15');
    expect(rows[0].querySelector('[data-testid="ctr"]').textContent).toContain('7.50%');
    expect(rows[1].querySelector('[data-testid="ctr"]').textContent).toContain('0.00%');
  });

  it('shows a 409 load error and retries instead of displaying an empty list', () => {
    component.promos.set([]);
    mockPromosService.listPromos.mockReturnValue(
      throwError(() => new ApiClientError(409, 'failed', 'API 409')),
    );
    component.loadPromos();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'API 409',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No promos found');
    mockPromosService.listPromos.mockReturnValue(of({ promos: mockPromos }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.listPromos).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
  });
  it('retains rows on a 409 action error and retries the failed pause', () => {
    mockPromosService.pausePromo.mockReturnValue(
      throwError(() => new ApiClientError(409, 'failed', 'API 409')),
    );
    component.toggleActive(mockPromos[0]);
    fixture.detectChanges();
    expect(component.promos()).toEqual(mockPromos);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('API 409');
    mockPromosService.pausePromo.mockReturnValue(of({ ...mockPromos[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.pausePromo.mock.calls).toEqual([
      [mockPromos[0].id],
      [mockPromos[0].id],
    ]);
    expect(component.promos()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('shows a 422 load error and retries instead of displaying an empty list', () => {
    component.promos.set([]);
    mockPromosService.listPromos.mockReturnValue(
      throwError(() => new ApiClientError(422, 'failed', 'API 422')),
    );
    component.loadPromos();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'API 422',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No promos found');
    mockPromosService.listPromos.mockReturnValue(of({ promos: mockPromos }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.listPromos).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
  });
  it('retains rows on a 422 action error and retries the failed pause', () => {
    mockPromosService.pausePromo.mockReturnValue(
      throwError(() => new ApiClientError(422, 'failed', 'API 422')),
    );
    component.toggleActive(mockPromos[0]);
    fixture.detectChanges();
    expect(component.promos()).toEqual(mockPromos);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('API 422');
    mockPromosService.pausePromo.mockReturnValue(of({ ...mockPromos[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.pausePromo.mock.calls).toEqual([
      [mockPromos[0].id],
      [mockPromos[0].id],
    ]);
    expect(component.promos()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('shows a 503 load error and retries instead of displaying an empty list', () => {
    component.promos.set([]);
    mockPromosService.listPromos.mockReturnValue(
      throwError(() => new ApiClientError(503, 'failed', 'API 503')),
    );
    component.loadPromos();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]').textContent).toContain(
      'Marketing is temporarily unavailable. Try again shortly.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('No promos found');
    mockPromosService.listPromos.mockReturnValue(of({ promos: mockPromos }));
    fixture.nativeElement.querySelector('[data-testid="load-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.listPromos).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
  });
  it('retains rows on a 503 action error and retries the failed pause', () => {
    mockPromosService.pausePromo.mockReturnValue(
      throwError(() => new ApiClientError(503, 'failed', 'API 503')),
    );
    component.toggleActive(mockPromos[0]);
    fixture.detectChanges();
    expect(component.promos()).toEqual(mockPromos);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Marketing is temporarily unavailable. Try again shortly.');
    mockPromosService.pausePromo.mockReturnValue(of({ ...mockPromos[0], active: false }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.pausePromo.mock.calls).toEqual([
      [mockPromos[0].id],
      [mockPromos[0].id],
    ]);
    expect(component.promos()[0].active).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')).toBeNull();
  });

  it('keeps existing rows when reloading fails', () => {
    mockPromosService.listPromos.mockReturnValue(throwError(() => new Error('offline')));
    component.loadPromos();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="promo-row"]').length).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="load-error"]')).not.toBeNull();
  });
  it('retries a failed resume with the same id', () => {
    mockPromosService.resumePromo.mockReturnValue(
      throwError(() => new ApiClientError(422, 'invalid', 'Cannot resume')),
    );
    component.toggleActive(mockPromos[1]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Cannot resume');
    mockPromosService.resumePromo.mockReturnValue(of({ ...mockPromos[1], active: true }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.resumePromo.mock.calls).toEqual([
      [mockPromos[1].id],
      [mockPromos[1].id],
    ]);
    expect(component.promos()[1].active).toBe(true);
  });

  it('keeps rows on failed duplication and appends the retried result once', () => {
    mockPromosService.duplicatePromo.mockReturnValue(
      throwError(() => new ApiClientError(409, 'conflict', 'Cannot duplicate')),
    );
    component.duplicatePromo(mockPromos[0]);
    fixture.detectChanges();
    expect(component.promos()).toEqual(mockPromos);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]').textContent,
    ).toContain('Cannot duplicate');
    mockPromosService.duplicatePromo.mockReturnValue(of({ ...mockPromos[0], id: 'copy' }));
    fixture.nativeElement.querySelector('[data-testid="action-error"] button').click();
    fixture.detectChanges();
    expect(mockPromosService.duplicatePromo.mock.calls).toEqual([['promo-1'], ['promo-1']]);
    expect(component.promos().map((p) => p.id)).toEqual(['copy', 'promo-1', 'promo-2']);
  });
});
