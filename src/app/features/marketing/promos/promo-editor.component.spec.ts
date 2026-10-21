import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PromoEditorComponent } from './promo-editor.component';
import { PromosService, PromoItem } from './promos.service';

describe('PromoEditorComponent', () => {
  let component: PromoEditorComponent;
  let fixture: ComponentFixture<PromoEditorComponent>;
  let mockPromosService: {
    getPriceItems: ReturnType<typeof vi.fn>;
    getPromo: ReturnType<typeof vi.fn>;
    createPromo: ReturnType<typeof vi.fn>;
    updatePromo: ReturnType<typeof vi.fn>;
    previewPromo: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const mockExistingPromo: PromoItem = {
    id: 'promo-123',
    placement: 'home_carousel',
    internal_name: 'Thyroid Health',
    eyebrow: 'Special',
    headline: 'Check Your Thyroid Profile',
    body: 'Complete T3, T4, TSH testing at home.',
    cta_label: 'Book Checkup',
    secondary_label: null,
    style: 'Brand Gradient',
    image_url: 'https://cdn.forumhospital.com/thyroid.png',
    target_kind: 'package',
    target_id: 'pkg-thyroid',
    coupon_id: null,
    price_item_ids: [],
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

  beforeEach(async () => {
    mockPromosService = {
      getPriceItems: vi
        .fn()
        .mockReturnValue(
          of([{ id: 'tst-cbc', name: 'CBC', mrp_paise: 19900, offer_price_paise: null }]),
        ),
      getPromo: vi.fn().mockReturnValue(of(mockExistingPromo)),
      createPromo: vi.fn(),
      updatePromo: vi.fn(),
      previewPromo: vi
        .fn()
        .mockReturnValue(
          of({ eligible: true, promo: mockExistingPromo, banner: null, popup: null }),
        ),
    };

    await TestBed.configureTestingModule({
      imports: [PromoEditorComponent],
      providers: [
        provideRouter([]),
        {
          provide: CampaignsService,
          useValue: {
            getPolicy: vi
              .fn()
              .mockReturnValue(of({ allowed_image_hosts: ['cdn.forumhospital.com'] })),
          },
        },
        { provide: PromosService, useValue: mockPromosService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? null : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(PromoEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('displays the hospital domain warning banner (D-02)', () => {
    const banner = fixture.nativeElement.querySelector('[data-testid="domain-warning"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain(
      'Notice: Customer devices connect directly to this image host. Use only hosts controlled by Forum Hospital (D-02).',
    );
  });

  it('validates that image URL uses https scheme', () => {
    component.form.image_url = 'http://insecure-cdn.com/test.png';
    fixture.detectChanges();

    expect(component.isImageUrlValid()).toBe(false);
    expect(component.imageUrlError()).toBe('Image URL must use HTTPS.');

    component.form.image_url = 'https://cdn.forumhospital.com/test.png';
    fixture.detectChanges();

    expect(component.isImageUrlValid()).toBe(true);
    expect(component.imageUrlError()).toBeNull();
  });

  it('updates phone mockup in real-time when headline changes', () => {
    component.form.headline = 'Monsoon Special Immunity Check';
    fixture.detectChanges();

    const mockupHeadline = fixture.nativeElement.querySelector('[data-testid="mockup-headline"]');
    expect(mockupHeadline.textContent).toContain('Monsoon Special Immunity Check');
  });

  it('submits valid new promo form and shows the saved preview', () => {
    mockPromosService.createPromo.mockReturnValue(of(mockExistingPromo));

    component.form.placement = 'home_carousel';
    component.form.internal_name = 'New Immunity Campaign';
    component.form.headline = 'Immunity Care';
    component.form.body = 'Protect your family with routine tests.';
    component.form.cta_label = 'Explore';
    component.form.image_url = 'https://cdn.forumhospital.com/banner.png';
    component.form.target_kind = 'none';

    component.savePromo();

    expect(mockPromosService.createPromo).toHaveBeenCalled();
    expect(mockPromosService.previewPromo).toHaveBeenCalledWith({
      id: mockExistingPromo.id,
      audience_mode: 'all',
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="saved-preview"]')?.textContent,
    ).toContain('Eligible for this audience');
  });
  it('loads IST wall time, preserves untouched seconds and sends edits with an IST offset', () => {
    const stored = {
      ...mockExistingPromo,
      starts_at: '2026-11-01T10:00:42.123Z',
      ends_at: '2026-11-02T10:00:59.000Z',
    };
    mockPromosService.getPromo.mockReturnValue(of(stored));
    mockPromosService.updatePromo.mockReturnValue(of(stored));
    component.promoId = stored.id;
    component.loadPromo(stored.id);
    expect(component.form.starts_at).toBe('2026-11-01T15:30');
    expect(component.form.ends_at).toBe('2026-11-02T15:30');
    component.form.headline = 'Unrelated copy';
    component.savePromo();
    expect(mockPromosService.updatePromo).toHaveBeenLastCalledWith(
      stored.id,
      expect.objectContaining({
        starts_at: stored.starts_at,
        ends_at: stored.ends_at,
      }),
    );
    component.form.starts_at = '2026-11-01T16:00';
    component.savePromo();
    expect(mockPromosService.updatePromo).toHaveBeenLastCalledWith(
      stored.id,
      expect.objectContaining({
        starts_at: '2026-11-01T16:00:00+05:30',
        ends_at: stored.ends_at,
      }),
    );
  });
  it('rejects malformed pins visibly without discarding text or saving an unrestricted audience', () => {
    component.loadPromo(mockExistingPromo.id);
    for (const text of ['56001', '560038, 060001', 'abc']) {
      component.form.pincodes = text;
      component.savePromo();
      fixture.detectChanges();
      expect(component.form.pincodes).toBe(text);
      expect(fixture.nativeElement.textContent).toContain('Invalid pincodes:');
      expect(mockPromosService.createPromo).not.toHaveBeenCalled();
      expect(mockPromosService.updatePromo).not.toHaveBeenCalled();
    }
    mockPromosService.createPromo.mockReturnValue(of(mockExistingPromo));
    component.form.pincodes = '560038, 560001\n560038';
    component.savePromo();
    expect(mockPromosService.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: expect.objectContaining({ pincodes: ['560038', '560001'] }),
      }),
    );
  });
  it.each([true, false, undefined])(
    'round-trips never_booked=%s while editing unrelated copy',
    async (value) => {
      const stored = {
        ...mockExistingPromo,
        audience: {
          audience_mode: 'all' as const,
          ...(value === undefined ? {} : { never_booked: value }),
        },
      };
      mockPromosService.getPromo.mockReturnValue(of(stored));
      mockPromosService.updatePromo.mockReturnValue(of(stored));
      component.promoId = stored.id;
      component.loadPromo(stored.id);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.form.never_booked).toBe(value === undefined ? 'any' : value ? 'yes' : 'no');
      expect(
        (fixture.nativeElement.querySelector('#never-booked') as HTMLSelectElement).value,
      ).toBe(component.form.never_booked);
      component.form.headline = 'Unrelated edit';
      component.savePromo();
      const audience = mockPromosService.updatePromo.mock.calls[0][1].audience;
      expect(audience.never_booked).toBe(value);
      expect(Object.hasOwn(audience, 'never_booked')).toBe(value !== undefined);
    },
  );
  it.each([
    'http://cdn.forumhospital.com/a.png',
    'https://user:pass@cdn.forumhospital.com/a.png',
    'https://cdn.forumhospital.com.evil.test/a.png',
    'not a url',
    `https://cdn.forumhospital.com/${'a'.repeat(2100)}`,
  ])('blocks save and all preview images for invalid URL %s', (url) => {
    component.loadPromo(mockExistingPromo.id);
    component.form.image_url = url;
    fixture.detectChanges();
    expect(component.imageUrlError()).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(0);
    component.savePromo();
    expect(mockPromosService.createPromo).not.toHaveBeenCalled();
    expect(mockPromosService.updatePromo).not.toHaveBeenCalled();
  });

  it('allows configured subdomains and refuses rendering while policy is pending', () => {
    const pending = new Subject<any>();
    vi.mocked(TestBed.inject(CampaignsService).getPolicy).mockReturnValue(pending);
    component.allowedImageHosts.set(null);
    component.loadImagePolicy();
    component.form.image_url = 'https://img.cdn.forumhospital.com/a.png';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(0);
    pending.next({ allowed_image_hosts: ['cdn.forumhospital.com'] });
    fixture.detectChanges();
    expect(component.imageUrlError()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('img').length).toBeGreaterThan(0);
  });
  it('sends the exact selected catalog IDs and renders the saved server preview', () => {
    mockPromosService.createPromo.mockReturnValue(of(mockExistingPromo));
    mockPromosService.previewPromo.mockReturnValue(
      of({
        eligible: true,
        promo: mockExistingPromo,
        popup: null,
        banner: {
          headline: 'Server resolved headline',
          body: 'Server body',
          prices_paise: [19900],
          image_url: null,
        },
      }),
    );
    component.form.internal_name = 'New promotion';
    component.form.headline = 'Local title';
    component.form.body = 'Local body';
    component.form.pincodes = '560038';
    component.form.platform = 'android';
    component.form.min_app_version = '2.0.0';
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    component.savePromo();
    expect(mockPromosService.createPromo).toHaveBeenCalledWith({
      placement: 'home_carousel',
      internal_name: 'New promotion',
      eyebrow: null,
      headline: 'Local title',
      body: 'Local body',
      cta_label: 'Book Now',
      secondary_label: null,
      style: 'Brand Gradient',
      image_url: null,
      target_kind: 'none',
      target_id: null,
      coupon_id: null,
      price_item_ids: ['tst-cbc'],
      audience: {
        audience_mode: 'all',
        pincodes: ['560038'],
        platform: 'android',
        min_app_version: '2.0.0',
      },
      priority: 0,
      starts_at: null,
      ends_at: null,
      frequency: 'once_per_day',
      frequency_days: null,
      max_impressions: null,
      active: false,
    });
    expect(mockPromosService.previewPromo).toHaveBeenCalledWith({
      id: 'promo-123',
      audience_mode: 'all',
      pincode: '560038',
      platform: 'android',
      app_version: '2.0.0',
    });
    fixture.detectChanges();
    const preview = fixture.nativeElement.querySelector('[data-testid="saved-preview"]');
    expect(preview.textContent).toContain('Server resolved headline');
    expect(preview.textContent).toContain('Server body');
    expect(preview.textContent).toContain('₹199.00');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('loads existing price selections and sends an explicit empty list when removed', () => {
    const stored = { ...mockExistingPromo, price_item_ids: ['old-item'] };
    mockPromosService.getPromo.mockReturnValue(of(stored));
    mockPromosService.updatePromo.mockReturnValue(of(stored));
    component.promoId = stored.id;
    component.loadPromo(stored.id);
    expect(component.form.price_item_ids).toEqual(['old-item']);
    component.togglePriceItem('old-item', false);
    component.savePromo();
    expect(mockPromosService.updatePromo).toHaveBeenCalledWith(
      stored.id,
      expect.objectContaining({ price_item_ids: [] }),
    );
  });
});
