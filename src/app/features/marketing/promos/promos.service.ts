import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface PromoPriceItem {
  id: string;
  name: string;
  mrp_paise: number;
  offer_price_paise: number | null;
}

export type PromoPlacement = 'home_carousel' | 'home_popup';

export type PromoStatus = 'live' | 'scheduled' | 'paused' | 'ended';

export type PromoTargetKind =
  | 'category'
  | 'tests'
  | 'item'
  | 'package'
  | 'coupon'
  | 'support'
  | 'bookings'
  | 'reports_list'
  | 'home'
  | 'none';

export type PromoFrequency = 'every_session' | 'once_per_day' | 'once_every_n_days' | 'once_ever';

export interface PromoAudienceDto {
  audience_mode: 'all' | 'guests' | 'signed_in';
  pincodes?: string[];
  platform?: 'android' | 'ios';
  min_app_version?: string;
  never_booked?: boolean;
}

export interface PromoItem {
  id: string;
  placement: PromoPlacement;
  internal_name: string;
  eyebrow: string | null;
  headline: string;
  body: string;
  cta_label: string;
  secondary_label: string | null;
  style: string | null;
  image_url: string | null;
  target_kind: PromoTargetKind;
  target_id: string | null;
  coupon_id: string | null;
  price_item_ids: string[];
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  status: PromoStatus;
  frequency: PromoFrequency;
  frequency_days: number | null;
  max_impressions: number | null;
  created_at: string;
  updated_at: string;
  audience?: PromoAudienceDto;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CreatePromoDto {
  placement: PromoPlacement;
  internal_name: string;
  eyebrow?: string | null;
  headline: string;
  body: string;
  cta_label: string;
  secondary_label?: string | null;
  style?: string | null;
  image_url?: string | null;
  target_kind: PromoTargetKind;
  target_id?: string | null;
  coupon_id?: string | null;
  price_item_ids?: string[];
  audience?: PromoAudienceDto;
  priority?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean;
  frequency?: PromoFrequency;
  frequency_days?: number | null;
  max_impressions?: number | null;
}

export interface UpdatePromoDto {
  placement?: PromoPlacement;
  internal_name?: string;
  eyebrow?: string | null;
  headline?: string;
  body?: string;
  cta_label?: string;
  secondary_label?: string | null;
  style?: string | null;
  image_url?: string | null;
  target_kind?: PromoTargetKind;
  target_id?: string | null;
  coupon_id?: string | null;
  price_item_ids?: string[];
  audience?: PromoAudienceDto;
  priority?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean;
  frequency?: PromoFrequency;
  frequency_days?: number | null;
  max_impressions?: number | null;
}

export interface PromoDailyBreakdownDto {
  date: string;
  impressions: number;
  clicks: number;
  dismissals: number;
}

export interface PromoStatsDto {
  id: string;
  impressions: number;
  clicks: number;
  dismissals: number;
  daily_breakdown: PromoDailyBreakdownDto[];
}

export interface PromoPreviewQuery {
  id: string;
  audience_mode?: 'all' | 'guests' | 'signed_in';
  pincode?: string;
  platform?: 'android' | 'ios';
  app_version?: string;
}

export interface PromoPreviewResult {
  eligible: boolean;
  reason?: string;
  promo: PromoItem;
  banner: {
    id: string;
    eyebrow: string;
    headline: string;
    body: string;
    cta_label: string;
    target: {
      kind: string;
      target_id: string | null;
      item: unknown | null;
    };
    prices_paise: number[];
    image_url: string | null;
  } | null;
  popup: {
    id: string;
    headline: string;
    body: string;
    cta_label: string;
    secondary_label: string | null;
    image_url: string | null;
    target: {
      kind: string;
      target_id: string | null;
      item: unknown | null;
    };
    style: string | null;
    frequency: string;
    frequency_days: number | null;
    max_impressions: number | null;
  } | null;
}

@Injectable({
  providedIn: 'root',
})
export class PromosService {
  private readonly api = inject(ApiClient);

  listPromos(query?: {
    placement?: string;
    status?: string;
    search?: string;
    page?: number;
  }): Observable<{ promos: PromoItem[] }> {
    const params: Record<string, string> = {};
    if (query?.status) params['filter'] = query.status;
    if (query?.placement) params['placement'] = query.placement;
    if (query?.search) params['search'] = query.search;
    if (query?.page) params['page'] = String(query.page);

    return this.api.get<{ promos: PromoItem[] }>('/staff/promos', { params });
  }

  getPriceItems(): Observable<PromoPriceItem[]> {
    // Public catalog reads are available to marketing staff; staff catalog administration is role-restricted.
    return this.api.get<PromoPriceItem[]>('/catalog/items');
  }

  getPromo(id: string): Observable<PromoItem> {
    return this.api.get<PromoItem>(`/staff/promos/${id}`);
  }

  createPromo(promo: CreatePromoDto): Observable<PromoItem> {
    return this.api.post<PromoItem>('/staff/promos', promo, { idempotent: true });
  }

  updatePromo(id: string, patch: UpdatePromoDto): Observable<PromoItem> {
    return this.api.patch<PromoItem>(`/staff/promos/${id}`, patch, { idempotent: true });
  }

  pausePromo(id: string): Observable<PromoItem> {
    return this.api.post<PromoItem>(`/staff/promos/${id}/pause`, {}, { idempotent: true });
  }

  resumePromo(id: string): Observable<PromoItem> {
    return this.api.post<PromoItem>(`/staff/promos/${id}/resume`, {}, { idempotent: true });
  }

  duplicatePromo(id: string): Observable<PromoItem> {
    return this.api.post<PromoItem>(`/staff/promos/${id}/duplicate`, {}, { idempotent: true });
  }

  getStats(id: string): Observable<PromoStatsDto> {
    return this.api.get<PromoStatsDto>(`/staff/promos/${id}/stats`);
  }

  previewPromo(params: PromoPreviewQuery): Observable<PromoPreviewResult> {
    const queryParams: Record<string, string> = { id: params.id };
    if (params.audience_mode) queryParams['audience_mode'] = params.audience_mode;
    if (params.pincode) queryParams['pincode'] = params.pincode;
    if (params.platform) queryParams['platform'] = params.platform;
    if (params.app_version) queryParams['app_version'] = params.app_version;

    return this.api.get<PromoPreviewResult>('/staff/promos/preview', {
      params: queryParams,
    });
  }
}
