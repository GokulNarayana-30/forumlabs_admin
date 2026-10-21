import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { CouponEditorComponent, rupeesToPaise, paiseToRupees } from './coupon-editor.component';
import { CouponsService, StaffCouponDetailDto } from './coupons.service';

describe('CouponEditorComponent & Currency Helpers', () => {
  describe('rupeesToPaise and paiseToRupees', () => {
    it('correctly converts decimal rupee strings to integer paise', () => {
      expect(rupeesToPaise('10.01')).toBe(1001);
      expect(rupeesToPaise('0.1')).toBe(10);
      expect(rupeesToPaise('100')).toBe(10000);
      expect(rupeesToPaise('0')).toBe(0);
    });

    it('rejects invalid rupee formats (three decimals, negative, exponent, overflow)', () => {
      expect(() => rupeesToPaise('1.001')).toThrow();
      expect(() => rupeesToPaise('-50')).toThrow();
      expect(() => rupeesToPaise('1e5')).toThrow();
      expect(() => rupeesToPaise('99999999999')).toThrow();
    });

    it('converts integer paise back to display rupee string', () => {
      expect(paiseToRupees(1001)).toBe('10.01');
      expect(paiseToRupees(10000)).toBe('100');
      expect(paiseToRupees(10)).toBe('0.10');
      expect(paiseToRupees(null)).toBe('');
    });
  });

  describe('Component Form, Validation & Audit Preview', () => {
    let component: CouponEditorComponent;
    let fixture: ComponentFixture<CouponEditorComponent>;
    let mockCouponsService: {
      getCoupon: ReturnType<typeof vi.fn>;
      createCoupon: ReturnType<typeof vi.fn>;
      updateCoupon: ReturnType<typeof vi.fn>;
    };
    let router: Router;

    const mockDetail: StaffCouponDetailDto = {
      id: 'cpn-test-1',
      code: 'ORIGINAL100',
      title: 'Original Title',
      description: 'Original Description',
      kind: 'flat',
      value: 10000,
      max_discount_paise: null,
      min_amount_paise: 50000,
      valid_from: '2026-06-01T00:00:00.000Z',
      valid_until: '2026-06-30T23:59:59.000Z',
      applies_all: true,
      applies_item_ids: [],
      applies_category_ids: [],
      per_user_limit: 1,
      total_redemption_limit: 500,
      active: true,
      position: 0,
      redemption_count: 5,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'user-1',
    };

    beforeEach(async () => {
      mockCouponsService = {
        getCoupon: vi.fn().mockReturnValue(of(mockDetail)),
        createCoupon: vi.fn(),
        updateCoupon: vi.fn(),
      };

      await TestBed.configureTestingModule({
        imports: [CouponEditorComponent],
        providers: [
          provideRouter([]),
          { provide: CouponsService, useValue: mockCouponsService },
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

      fixture = TestBed.createComponent(CouponEditorComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('normalizes coupon code to uppercase and alphanumeric', () => {
      component.form.code = 'monsoon_50!';
      component.onCodeInput();
      expect(component.form.code).toBe('MONSOON50');
    });

    it('audit preview produces allowlisted old/new values and never leaks free-text canaries', () => {
      component.existingCoupon = mockDetail;
      component.isEditMode = true;

      // Change an allowlisted numeric field
      component.form.value = '150'; // flat Rs 150 = 15000 paise

      // Change free-text fields with canary sensitive text
      component.form.title = 'Confidential Patient Special';
      component.form.description = 'Secret promo text';

      fixture.detectChanges();

      const preview = component.computeAuditPreview();

      // Allowlisted field carries old and new values
      const valueChange = preview.allowlistedChanges.find((c) => c.field === 'value');
      expect(valueChange).toBeDefined();
      expect(valueChange?.oldValue).toBe(10000);
      expect(valueChange?.newValue).toBe(15000);

      // Free-text fields are recorded in changedTextPropertyNames ONLY (no values)
      expect(preview.changedTextPropertyNames).toContain('title');
      expect(preview.changedTextPropertyNames).toContain('description');

      // The canary strings MUST NOT appear in the rendered audit preview HTML
      const previewHtml = fixture.nativeElement.innerHTML;
      expect(previewHtml).not.toContain('Confidential Patient Special');
      expect(previewHtml).not.toContain('Secret promo text');
    });

    it('submits valid new coupon form and navigates back', () => {
      mockCouponsService.createCoupon.mockReturnValue(of(mockDetail));

      component.form.code = 'NEWYEAR50';
      component.form.title = 'New Year Discount';
      component.form.description = 'Rs 50 off';
      component.form.kind = 'flat';
      component.form.value = '50';
      component.form.applies_mode = 'all';

      component.saveCoupon();

      expect(mockCouponsService.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NEWYEAR50',
          kind: 'flat',
          value: 5000,
          appliesAll: true,
        }),
      );
      expect(router.navigate).toHaveBeenCalledWith(['..'], { relativeTo: expect.anything() });
    });

    it('loads IST wall time, preserves untouched seconds and sends edits with an IST offset', () => {
      const stored = {
        ...mockDetail,
        valid_from: '2026-11-01T10:00:42.123Z',
        valid_until: '2026-11-02T10:00:59.000Z',
      };
      mockCouponsService.getCoupon.mockReturnValue(of(stored));
      mockCouponsService.updateCoupon.mockReturnValue(of(stored));
      component.couponId = stored.id;
      component.loadCoupon(stored.id);
      expect(component.form.valid_from).toBe('2026-11-01T15:30');
      expect(component.form.valid_until).toBe('2026-11-02T15:30');
      component.form.title = 'Unrelated copy';
      component.saveCoupon();
      expect(mockCouponsService.updateCoupon).toHaveBeenLastCalledWith(
        stored.id,
        expect.objectContaining({
          validFrom: stored.valid_from,
          validUntil: stored.valid_until,
        }),
      );
      component.form.valid_from = '2026-11-01T16:00';
      component.saveCoupon();
      expect(mockCouponsService.updateCoupon).toHaveBeenLastCalledWith(
        stored.id,
        expect.objectContaining({
          validFrom: '2026-11-01T16:00:00+05:30',
          validUntil: stored.valid_until,
        }),
      );
    });

    it.each(['100.9', '20oops', '1e2', '0', '101', '-2', ''])(
      'rejects the whole invalid percent %s and never previews a truncated discount',
      (input) => {
        component.loadCoupon(mockDetail.id);
        component.form.kind = 'percent';
        component.form.value = input;
        fixture.detectChanges();
        expect(component.validatedPercent()).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Enter a whole percent from 1 to 100');
        component.saveCoupon();
        expect(component.errorMessage()).toContain('integer between 1 and 100');
        expect(mockCouponsService.createCoupon).not.toHaveBeenCalled();
      },
    );

    it.each(['1', '20', '100'])('previews and sends the same validated percent %s', (input) => {
      component.loadCoupon(mockDetail.id);
      mockCouponsService.createCoupon.mockReturnValue(of(mockDetail));
      component.form.kind = 'percent';
      component.form.value = input;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(`${Number(input)}% OFF`);
      component.saveCoupon();
      expect(mockCouponsService.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'percent', value: Number(input) }),
      );
    });
  });
});
