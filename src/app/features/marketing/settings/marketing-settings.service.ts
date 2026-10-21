import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface MarketingSettingsDto {
  approvalThreshold: number;
  perUserDailyCap: number;
  perUserWeeklyCap: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  allowedImageHosts: string[];
}

export interface UpdateMarketingSettingsDto {
  approvalThreshold?: number;
  perUserDailyCap?: number;
  perUserWeeklyCap?: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  allowedImageHosts?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class MarketingSettingsService {
  private readonly api = inject(ApiClient);

  getSettings(): Observable<MarketingSettingsDto> {
    return this.api.get<MarketingSettingsDto>('/staff/marketing/settings');
  }

  updateSettings(patch: UpdateMarketingSettingsDto): Observable<MarketingSettingsDto> {
    return this.api.patch<MarketingSettingsDto>('/staff/marketing/settings', patch, {
      idempotent: true,
    });
  }
}
