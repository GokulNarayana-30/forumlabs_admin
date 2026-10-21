import { instantToIstInput, istInputToInstant, instantOrOriginal } from '../ist-datetime';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import {
  CouponsService,
  CreateCouponDto,
  UpdateCouponDto,
  StaffCouponDetailDto,
} from './coupons.service';

export function rupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error('Invalid rupee amount');
    input = input.toString();
  }
  const trimmed = input.trim();
  if (!trimmed) return 0;
  // Reject exponent, NaN, negative, or more than two decimal places
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Invalid rupee format: must be positive decimal with up to 2 decimal places');
  }
  const parts = trimmed.split('.');
  const whole = BigInt(parts[0]);
  const fraction = BigInt((parts[1] ?? '').padEnd(2, '0'));
  const totalPaiseBig = whole * 100n + fraction;
  if (totalPaiseBig > 2147483647n) {
    throw new Error('Rupee amount exceeds maximum limit');
  }
  const totalPaise = Number(totalPaiseBig);
  if (!Number.isSafeInteger(totalPaise)) {
    throw new Error('Rupee amount is not a safe integer in paise');
  }
  return totalPaise;
}

export function paiseToRupees(paise: number | null | undefined): string {
  if (paise == null) return '';
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  if (frac === 0) return whole.toString();
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

const AUDIT_ALLOWLIST = [
  'id',
  'kind',
  'value',
  'maxDiscountPaise',
  'minAmountPaise',
  'validFrom',
  'validUntil',
  'appliesAll',
  'appliesItemIds',
  'appliesCategoryIds',
  'perUserLimit',
  'totalRedemptionLimit',
  'active',
  'oncePerAccount',
  'position',
] as const;

export interface CouponFormState {
  code: string;
  title: string;
  description: string;
  kind: 'flat' | 'percent';
  value: string; // Rupees if flat, percent integer (1..100) if percent
  max_discount_rupees: string;
  min_amount_rupees: string;
  per_user_limit: number | null;
  total_redemption_limit: number | null;
  valid_from: string;
  valid_until: string;
  applies_mode: 'all' | 'items' | 'categories';
  applies_item_ids: string;
  applies_category_ids: string;
  active: boolean;
}

export interface AuditChangeItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditPreviewResult {
  allowlistedChanges: AuditChangeItem[];
  changedTextPropertyNames: string[];
}

@Component({
  selector: 'app-coupon-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent],
  templateUrl: './coupon-editor.component.html',
})
export class CouponEditorComponent implements OnInit {
  private readonly couponsService = inject(CouponsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  couponId: string | null = null;
  isEditMode = false;
  existingCoupon: StaffCouponDetailDto | null = null;

  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  form: CouponFormState = {
    code: '',
    title: '',
    description: '',
    kind: 'flat',
    value: '',
    max_discount_rupees: '',
    min_amount_rupees: '0',
    per_user_limit: 1,
    total_redemption_limit: null,
    valid_from: '',
    valid_until: '',
    applies_mode: 'all',
    applies_item_ids: '',
    applies_category_ids: '',
    active: true,
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.couponId = id;
      this.isEditMode = true;
      this.loadCoupon(id);
    }
  }

  loadCoupon(id: string): void {
    this.loading.set(true);
    this.couponsService.getCoupon(id).subscribe({
      next: (coupon) => {
        this.existingCoupon = coupon;
        let mode: 'all' | 'items' | 'categories' = 'all';
        if (!coupon.applies_all) {
          if (coupon.applies_item_ids.length > 0) mode = 'items';
          else if (coupon.applies_category_ids.length > 0) mode = 'categories';
        }

        this.form = {
          code: coupon.code,
          title: coupon.title,
          description: coupon.description,
          kind: coupon.kind as 'flat' | 'percent',
          value: coupon.kind === 'flat' ? paiseToRupees(coupon.value) : coupon.value.toString(),
          max_discount_rupees: coupon.max_discount_paise
            ? paiseToRupees(coupon.max_discount_paise)
            : '',
          min_amount_rupees: paiseToRupees(coupon.min_amount_paise) || '0',
          per_user_limit: coupon.per_user_limit,
          total_redemption_limit: coupon.total_redemption_limit,
          valid_from: instantToIstInput(coupon.valid_from),
          valid_until: instantToIstInput(coupon.valid_until),
          applies_mode: mode,
          applies_item_ids: coupon.applies_item_ids.join(', '),
          applies_category_ids: coupon.applies_category_ids.join(', '),
          active: coupon.active,
        };
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load coupon.');
        this.loading.set(false);
      },
    });
  }

  onCodeInput(): void {
    this.form.code = this.form.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  computeAuditPreview(): AuditPreviewResult {
    if (!this.existingCoupon) {
      return { allowlistedChanges: [], changedTextPropertyNames: [] };
    }

    const allowlistedChanges: AuditChangeItem[] = [];
    const changedTextPropertyNames: string[] = [];

    // Parse current form state into backend shape
    const currentKind = this.form.kind;
    let currentValue = 0;
    try {
      currentValue =
        currentKind === 'flat' ? rupeesToPaise(this.form.value) : (this.validatedPercent() ?? 0);
    } catch {
      currentValue = 0;
    }

    let currentMaxDiscount: number | null = null;
    if (currentKind === 'percent' && this.form.max_discount_rupees) {
      try {
        currentMaxDiscount = rupeesToPaise(this.form.max_discount_rupees);
      } catch {
        currentMaxDiscount = null;
      }
    }

    let currentMinAmount = 0;
    try {
      currentMinAmount = rupeesToPaise(this.form.min_amount_rupees);
    } catch {
      currentMinAmount = 0;
    }

    const currentValidFrom = this.dateValue(this.form.valid_from, this.existingCoupon?.valid_from);
    const currentValidUntil = this.dateValue(
      this.form.valid_until,
      this.existingCoupon?.valid_until,
    );
    const currentAppliesAll = this.form.applies_mode === 'all';
    const currentItemIds =
      this.form.applies_mode === 'items'
        ? this.form.applies_item_ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const currentCategoryIds =
      this.form.applies_mode === 'categories'
        ? this.form.applies_category_ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const currentMap: Record<string, unknown> = {
      kind: currentKind,
      value: currentValue,
      maxDiscountPaise: currentMaxDiscount,
      minAmountPaise: currentMinAmount,
      validFrom: currentValidFrom,
      validUntil: currentValidUntil,
      appliesAll: currentAppliesAll,
      appliesItemIds: currentItemIds,
      appliesCategoryIds: currentCategoryIds,
      perUserLimit: this.form.per_user_limit,
      totalRedemptionLimit: this.form.total_redemption_limit,
      active: this.form.active,
    };

    const existingMap: Record<string, unknown> = {
      kind: this.existingCoupon.kind,
      value: this.existingCoupon.value,
      maxDiscountPaise: this.existingCoupon.max_discount_paise,
      minAmountPaise: this.existingCoupon.min_amount_paise,
      validFrom: this.existingCoupon.valid_from,
      validUntil: this.existingCoupon.valid_until,
      appliesAll: this.existingCoupon.applies_all,
      appliesItemIds: this.existingCoupon.applies_item_ids,
      appliesCategoryIds: this.existingCoupon.applies_category_ids,
      perUserLimit: this.existingCoupon.per_user_limit,
      totalRedemptionLimit: this.existingCoupon.total_redemption_limit,
      active: this.existingCoupon.active,
    };

    for (const field of AUDIT_ALLOWLIST) {
      if (field in currentMap) {
        const oldV = existingMap[field];
        const newV = currentMap[field];
        const isDifferent =
          Array.isArray(oldV) && Array.isArray(newV)
            ? JSON.stringify(oldV) !== JSON.stringify(newV)
            : oldV !== newV;

        if (isDifferent) {
          allowlistedChanges.push({ field, oldValue: oldV, newValue: newV });
        }
      }
    }

    // Free text check (title, description, code) - Record ONLY property names
    if (this.form.title.trim() !== this.existingCoupon.title.trim()) {
      changedTextPropertyNames.push('title');
    }
    if (this.form.description.trim() !== this.existingCoupon.description.trim()) {
      changedTextPropertyNames.push('description');
    }
    if (this.form.code.trim() !== this.existingCoupon.code.trim()) {
      changedTextPropertyNames.push('code');
    }

    return { allowlistedChanges, changedTextPropertyNames };
  }

  validatedPercent(): number | null {
    const value = this.form.value.trim();
    if (!/^[0-9]+$/.test(value)) return null;
    const percent = Number(value);
    return Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : null;
  }

  saveCoupon(): void {
    if (
      (this.form.valid_from && !istInputToInstant(this.form.valid_from)) ||
      (this.form.valid_until && !istInputToInstant(this.form.valid_until))
    ) {
      this.errorMessage.set('Enter a valid IST date and time.');
      return;
    }
    this.errorMessage.set(null);

    const code = this.form.code.trim();
    if (!/^[A-Z0-9]{3,32}$/.test(code)) {
      this.errorMessage.set('Coupon code must be 3-32 uppercase alphanumeric characters.');
      return;
    }
    if (!this.form.title.trim()) {
      this.errorMessage.set('Title is required.');
      return;
    }
    if (!this.form.description.trim()) {
      this.errorMessage.set('Description is required.');
      return;
    }

    let numValue = 0;
    try {
      if (this.form.kind === 'flat') {
        numValue = rupeesToPaise(this.form.value);
        if (numValue <= 0) throw new Error();
      } else {
        const percent = this.validatedPercent();
        if (percent === null) {
          this.errorMessage.set('Percent discount must be an integer between 1 and 100.');
          return;
        }
        numValue = percent;
      }
    } catch {
      this.errorMessage.set('Invalid discount value format.');
      return;
    }

    let maxDiscountPaise: number | null = null;
    if (this.form.kind === 'percent' && this.form.max_discount_rupees.trim()) {
      try {
        maxDiscountPaise = rupeesToPaise(this.form.max_discount_rupees);
      } catch {
        this.errorMessage.set('Invalid maximum discount format.');
        return;
      }
    }

    let minAmountPaise = 0;
    if (this.form.min_amount_rupees.trim()) {
      try {
        minAmountPaise = rupeesToPaise(this.form.min_amount_rupees);
      } catch {
        this.errorMessage.set('Invalid minimum order amount format.');
        return;
      }
    }

    if (this.form.valid_from && this.form.valid_until) {
      const s = Date.parse(this.dateValue(this.form.valid_from, this.existingCoupon?.valid_from)!);
      const e = Date.parse(
        this.dateValue(this.form.valid_until, this.existingCoupon?.valid_until)!,
      );
      if (s >= e) {
        this.errorMessage.set('Start validity must be strictly before End validity.');
        return;
      }
    }

    const appliesAll = this.form.applies_mode === 'all';
    const appliesItemIds =
      this.form.applies_mode === 'items'
        ? this.form.applies_item_ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const appliesCategoryIds =
      this.form.applies_mode === 'categories'
        ? this.form.applies_category_ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (!appliesAll && appliesItemIds.length === 0 && appliesCategoryIds.length === 0) {
      this.errorMessage.set(
        'When applicability is specific, at least one test, package, or category must be specified.',
      );
      return;
    }

    const payload: CreateCouponDto = {
      code,
      title: this.form.title.trim(),
      description: this.form.description.trim(),
      kind: this.form.kind,
      value: numValue,
      maxDiscountPaise: this.form.kind === 'percent' ? maxDiscountPaise : null,
      minAmountPaise,
      validFrom: this.dateValue(this.form.valid_from, this.existingCoupon?.valid_from),
      validUntil: this.dateValue(this.form.valid_until, this.existingCoupon?.valid_until),
      appliesAll,
      appliesItemIds,
      appliesCategoryIds,
      perUserLimit: this.form.per_user_limit ? Number(this.form.per_user_limit) : null,
      totalRedemptionLimit: this.form.total_redemption_limit
        ? Number(this.form.total_redemption_limit)
        : null,
      active: this.form.active,
    };

    this.saving.set(true);

    if (this.couponId) {
      const updatePayload: UpdateCouponDto = {
        title: payload.title,
        description: payload.description,
        kind: payload.kind,
        value: payload.value,
        maxDiscountPaise: payload.maxDiscountPaise,
        minAmountPaise: payload.minAmountPaise,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
        appliesAll: payload.appliesAll,
        appliesItemIds: payload.appliesItemIds,
        appliesCategoryIds: payload.appliesCategoryIds,
        perUserLimit: payload.perUserLimit,
        totalRedemptionLimit: payload.totalRedemptionLimit,
        active: payload.active,
      };

      this.couponsService.updateCoupon(this.couponId, updatePayload).subscribe({
        next: () => {
          this.saving.set(false);
          this.router.navigate(['..'], { relativeTo: this.route });
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(err?.message || 'Failed to update coupon.');
        },
      });
    } else {
      this.couponsService.createCoupon(payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.router.navigate(['..'], { relativeTo: this.route });
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(err?.message || 'Failed to create coupon.');
        },
      });
    }
  }

  private dateValue(input: string, original: string | null | undefined): string | null {
    const value = instantOrOriginal(input, original);
    if (!value || value === original) return value;
    // Helpers validate/resolve the instant; edited wire values retain the explicit IST offset.
    return istInputToInstant(input) ? `${input}:00+05:30` : null;
  }

  cancel(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
