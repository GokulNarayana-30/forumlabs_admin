import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export type CampaignStatus =
  'draft' | 'pending_approval' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export type CampaignLinkKind =
  | 'category'
  | 'tests'
  | 'item'
  | 'package'
  | 'coupon'
  | 'support'
  | 'bookings'
  | 'reports_list'
  | 'home';

export interface CampaignAudienceZoneDto {
  id: string;
  pincodes: string[];
}

export interface CampaignAudienceDto {
  all_consented?: true;
  pincodes?: string[];
  zones?: CampaignAudienceZoneDto[];
  platform?: 'android' | 'ios';
  min_app_version?: string;
  last_booking_before_days?: number;
  last_booking_within_days?: number;
  never_booked?: boolean;
  has_upcoming_booking?: boolean;
  patient_ids?: string[];
}

export interface CampaignItem {
  id: string;
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkKind: CampaignLinkKind;
  linkTargetId: string | null;
  status: CampaignStatus;
  audience: CampaignAudienceDto;
  sendAt: string | null;
  respectQuietHours: boolean;
  onQuietHours: 'defer' | 'skip';
  revision: number;
  /** Own-device tests recorded so far, each naming the revision it covered. */
  test_sends?: TestSendLogItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignDto {
  name: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  linkKind?: CampaignLinkKind;
  linkTargetId?: string | null;
  audience?: CampaignAudienceDto;
  sendAt?: string | null;
  respectQuietHours?: true;
  onQuietHours?: 'defer' | 'skip';
}

export interface UpdateCampaignDto {
  name?: string;
  title?: string;
  body?: string;
  imageUrl?: string | null;
  linkKind?: CampaignLinkKind;
  linkTargetId?: string | null;
  audience?: CampaignAudienceDto;
  sendAt?: string | null;
  respectQuietHours?: true;
  onQuietHours?: 'defer' | 'skip';
}

/** What POST /staff/campaigns/{id}/estimate returns: the eligible count only. */
export interface AudienceEstimateDto {
  estimated_count: number;
  estimatedCount?: number;
}

export interface CampaignPlatformPreview {
  title: string;
  body: string;
  image_url: string | null;
  link: unknown;
}

export interface CampaignPreviewDto {
  android: CampaignPlatformPreview;
  ios: CampaignPlatformPreview;
  title_char_count: number;
  body_char_count: number;
  truncation_warnings: string[];
}

/** One recorded own-device test: which request, how many devices, and which revision it covered. */
export interface TestSendLogItem {
  requestId: string;
  count: number;
  revision: number;
  sentAt: string;
}

export interface TestSendResultDto {
  success: boolean;
  count: number;
  test_sends: TestSendLogItem[];
}

export interface CampaignCountsDto {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface CampaignReportDto {
  campaign: CampaignItem;
  counts: CampaignCountsDto;
  test_sends: TestSendLogItem[];
}

export interface CampaignRecipientItem {
  user_id: string;
  status: string;
  skip_reason: string | null;
  result: string | null;
  sent_at: string | null;
}

export interface CampaignRecipientsPageDto {
  items: CampaignRecipientItem[];
  total: number;
  page: number;
  limit: number;
}

export interface CampaignPolicyDto {
  approval_threshold: number;
  allowed_image_hosts: string[];
  push_connected?: boolean;
}

export interface TestDeviceItem {
  id: string;
  platform: string;
  app_version?: string | null;
  last_seen_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class CampaignsService {
  private readonly api = inject(ApiClient);

  listCampaigns(query?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Observable<{ campaigns: CampaignItem[] }> {
    const params: Record<string, string> = {};
    if (query?.status) params['status'] = query.status;
    if (query?.page) params['page'] = String(query.page);
    if (query?.limit) params['limit'] = String(query.limit);

    return this.api.get<{ campaigns: CampaignItem[] }>('/staff/campaigns', { params });
  }

  getCampaign(id: string): Observable<CampaignItem> {
    return this.api.get<CampaignItem>(`/staff/campaigns/${id}`);
  }

  createCampaign(campaign: CreateCampaignDto): Observable<CampaignItem> {
    return this.api.post<CampaignItem>('/staff/campaigns', campaign, { idempotent: true });
  }

  updateCampaign(id: string, patch: UpdateCampaignDto): Observable<CampaignItem> {
    return this.api.patch<CampaignItem>(`/staff/campaigns/${id}`, patch, { idempotent: true });
  }

  estimateAudience(id: string): Observable<AudienceEstimateDto> {
    return this.api.post<AudienceEstimateDto>(`/staff/campaigns/${id}/estimate`, {});
  }

  getPreview(id: string): Observable<CampaignPreviewDto> {
    return this.api.post<CampaignPreviewDto>(`/staff/campaigns/${id}/preview`, {});
  }

  testSend(
    id: string,
    data: { deviceIds: string[]; requestId: string },
  ): Observable<TestSendResultDto> {
    return this.api.post<TestSendResultDto>(`/staff/campaigns/${id}/test-send`, data, {
      idempotent: true,
    });
  }

  scheduleCampaign(id: string, data: { sendAt?: string | null }): Observable<CampaignItem> {
    return this.api.post<CampaignItem>(`/staff/campaigns/${id}/schedule`, data, {
      idempotent: true,
    });
  }

  approveCampaign(id: string): Observable<CampaignItem> {
    return this.api.post<CampaignItem>(`/staff/campaigns/${id}/approve`, {}, { idempotent: true });
  }

  cancelCampaign(id: string): Observable<CampaignItem> {
    return this.api.post<CampaignItem>(`/staff/campaigns/${id}/cancel`, {}, { idempotent: true });
  }

  getReport(id: string): Observable<CampaignReportDto> {
    return this.api.get<CampaignReportDto>(`/staff/campaigns/${id}/report`);
  }

  getRecipients(
    id: string,
    query?: { page?: number; limit?: number },
  ): Observable<CampaignRecipientsPageDto> {
    const params: Record<string, string> = {};
    if (query?.page) params['page'] = String(query.page);
    if (query?.limit) params['limit'] = String(query.limit);

    return this.api.get<CampaignRecipientsPageDto>(`/staff/campaigns/${id}/recipients`, { params });
  }

  getPolicy(): Observable<CampaignPolicyDto> {
    return this.api.get<CampaignPolicyDto>('/staff/campaigns/policy');
  }

  getTestDevices(): Observable<{ devices: TestDeviceItem[] }> {
    return this.api.get<{ devices: TestDeviceItem[] }>('/staff/campaigns/test-devices');
  }
}
