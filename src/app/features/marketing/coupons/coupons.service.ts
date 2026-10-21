import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface StaffCouponSummaryDto {
  id: string;
  code: string;
  title: string;
  description: string;
  kind: 'flat' | 'percent';
  value: number;
  max_discount_paise: number | null;
  min_amount_paise: number;
  valid_from: string | null;
  valid_until: string | null;
  applies_all: boolean;
  applies_item_ids: string[];
  applies_category_ids: string[];
  per_user_limit: number | null;
  total_redemption_limit: number | null;
  active: boolean;
  position: number;
  redemption_count: number;
}

export interface StaffCouponDetailDto extends StaffCouponSummaryDto {
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CreateCouponDto {
  code: string;
  title: string;
  description: string;
  kind: 'flat' | 'percent';
  value: number;
  maxDiscountPaise?: number | null;
  minAmountPaise?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  appliesAll: boolean;
  appliesItemIds?: string[];
  appliesCategoryIds?: string[];
  perUserLimit?: number | null;
  totalRedemptionLimit?: number | null;
  active?: boolean;
}

export interface UpdateCouponDto {
  title?: string;
  description?: string;
  kind?: 'flat' | 'percent';
  value?: number;
  maxDiscountPaise?: number | null;
  minAmountPaise?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  appliesAll?: boolean;
  appliesItemIds?: string[];
  appliesCategoryIds?: string[];
  perUserLimit?: number | null;
  totalRedemptionLimit?: number | null;
  active?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class CouponsService {
  private readonly api = inject(ApiClient);

  listCoupons(query?: {
    search?: string;
    status?: string;
    page?: number;
  }): Observable<{ coupons: StaffCouponSummaryDto[] }> {
    const params: Record<string, string> = {};
    if (query?.search) params['search'] = query.search;
    if (query?.status) params['status'] = query.status;
    if (query?.page) params['page'] = String(query.page);

    return this.api.get<{ coupons: StaffCouponSummaryDto[] }>('/staff/coupons', { params });
  }

  getCoupon(id: string): Observable<StaffCouponDetailDto> {
    return this.api.get<StaffCouponDetailDto>(`/staff/coupons/${id}`);
  }

  createCoupon(coupon: CreateCouponDto): Observable<StaffCouponDetailDto> {
    return this.api.post<StaffCouponDetailDto>('/staff/coupons', coupon, { idempotent: true });
  }

  updateCoupon(id: string, patch: UpdateCouponDto): Observable<StaffCouponDetailDto> {
    return this.api.patch<StaffCouponDetailDto>(`/staff/coupons/${id}`, patch, {
      idempotent: true,
    });
  }

  pauseCoupon(id: string): Observable<StaffCouponDetailDto> {
    return this.api.post<StaffCouponDetailDto>(
      `/staff/coupons/${id}/pause`,
      {},
      { idempotent: true },
    );
  }

  resumeCoupon(id: string): Observable<StaffCouponDetailDto> {
    return this.api.post<StaffCouponDetailDto>(
      `/staff/coupons/${id}/resume`,
      {},
      { idempotent: true },
    );
  }

  endCoupon(id: string): Observable<StaffCouponDetailDto> {
    return this.api.post<StaffCouponDetailDto>(
      `/staff/coupons/${id}/end`,
      {},
      { idempotent: true },
    );
  }
}
