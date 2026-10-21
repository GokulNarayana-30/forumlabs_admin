import { marketingErrorMessage } from '../marketing-errors';
import { formatInr } from '../inr';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import { UiDialogComponent } from '../../../shared/ui/ui-dialog.component';
import { CouponsService, StaffCouponSummaryDto } from './coupons.service';

export type CouponDerivedStatus = 'active' | 'paused' | 'expired';

@Component({
  selector: 'app-coupons-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    UiButtonComponent,
    UiTagComponent,
    UiDialogComponent,
  ],
  templateUrl: './coupons-list.component.html',
})
export class CouponsListComponent implements OnInit {
  private readonly couponsService = inject(CouponsService);

  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  private retryAction: (() => void) | null = null;

  retryFailedAction(): void {
    this.retryAction?.();
  }

  readonly coupons = signal<StaffCouponSummaryDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly actionLoadingId = signal<string | null>(null);
  readonly couponToEnd = signal<StaffCouponSummaryDto | null>(null);

  readonly filteredCoupons = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();
    let items = this.coupons();

    if (query) {
      items = items.filter(
        (c) =>
          c.code.toLowerCase().includes(query) ||
          c.title.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query),
      );
    }

    if (filter !== 'all') {
      items = items.filter((c) => this.couponStatus(c) === filter);
    }

    return items;
  });

  ngOnInit(): void {
    this.loadCoupons();
  }

  loadCoupons(): void {
    this.loadError.set(null);
    this.loading.set(true);
    this.couponsService.listCoupons().subscribe({
      next: (res) => {
        this.coupons.set(res.coupons);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(marketingErrorMessage(err, 'Failed to load coupons.'));
        this.loading.set(false);
      },
    });
  }

  couponStatus(c: StaffCouponSummaryDto): CouponDerivedStatus {
    if (!c.active) return 'paused';
    if (c.valid_until && new Date().getTime() >= new Date(c.valid_until).getTime()) {
      return 'expired';
    }
    return 'active';
  }

  statusSeverity(status: CouponDerivedStatus): string {
    switch (status) {
      case 'active':
        return 'success';
      case 'paused':
        return 'warn';
      case 'expired':
        return 'secondary';
      default:
        return 'secondary';
    }
  }

  formatDiscount(c: StaffCouponSummaryDto): string {
    if (c.kind === 'flat') {
      return `${formatInr(c.value)} OFF`;
    }
    const maxDiscount = c.max_discount_paise ? ` (up to ${formatInr(c.max_discount_paise)})` : '';
    return `${c.value}% OFF${maxDiscount}`;
  }

  formatMinOrder(minAmountPaise: number): string {
    if (!minAmountPaise || minAmountPaise === 0) return 'None';
    return `Min ${formatInr(minAmountPaise)}`;
  }

  formatRedemptionLimits(c: StaffCouponSummaryDto): { perUser: string; total: string } {
    const perUser = c.per_user_limit ? `${c.per_user_limit} per user` : 'Unlimited';
    const total = c.total_redemption_limit
      ? `${c.redemption_count} / ${c.total_redemption_limit} used`
      : `${c.redemption_count} used (Unlimited)`;
    return { perUser, total };
  }

  formatValidity(validFrom: string | null, validUntil: string | null): string {
    if (!validFrom && !validUntil) return 'Always valid';
    const s = validFrom
      ? new Date(validFrom).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'Open';
    const e = validUntil
      ? new Date(validUntil).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'No expiry';
    return `${s} - ${e}`;
  }

  toggleActive(c: StaffCouponSummaryDto): void {
    if (this.actionLoadingId() !== null) return;
    this.actionError.set(null);
    this.retryAction = () => {
      const current = this.coupons().find((item) => item.id === c.id);
      if (current) this.toggleActive(current);
    };
    this.actionLoadingId.set(c.id);
    const op = c.active
      ? this.couponsService.pauseCoupon(c.id)
      : this.couponsService.resumeCoupon(c.id);

    op.subscribe({
      next: (updated) => {
        this.coupons.update((list) =>
          list.map((item) => (item.id === c.id ? { ...item, ...updated } : item)),
        );
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionError.set(marketingErrorMessage(err, 'Failed to update coupon.'));
        this.actionLoadingId.set(null);
      },
    });
  }

  promptEndCoupon(c: StaffCouponSummaryDto): void {
    this.couponToEnd.set(c);
  }

  cancelEndCoupon(): void {
    this.couponToEnd.set(null);
  }

  confirmEndCoupon(): void {
    const c = this.couponToEnd();
    if (!c || this.actionLoadingId() !== null) return;
    this.actionError.set(null);
    this.retryAction = () => {
      this.couponToEnd.set(c);
      this.confirmEndCoupon();
    };
    this.actionLoadingId.set(c.id);
    this.couponsService.endCoupon(c.id).subscribe({
      next: (updated) => {
        this.coupons.update((list) =>
          list.map((item) => (item.id === c.id ? { ...item, ...updated } : item)),
        );
        this.couponToEnd.set(null);
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionError.set(marketingErrorMessage(err, 'Failed to update coupon.'));
        this.actionLoadingId.set(null);
      },
    });
  }
}
