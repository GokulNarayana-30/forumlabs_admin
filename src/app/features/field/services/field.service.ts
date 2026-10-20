import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  StaffOrderListItemDto,
  StaffOrderEventRecordResult,
} from '../../bookings/services/bookings.service';

@Injectable({
  providedIn: 'root',
})
export class FieldService {
  private readonly api = inject(ApiClient);

  async getTodayVisits(): Promise<StaffOrderListItemDto[]> {
    return firstValueFrom(
      this.api.get<StaffOrderListItemDto[]>('/staff/orders', {
        params: { assigned_to_me: 'true' },
      }),
    );
  }

  async recordEvent(orderId: string, body: unknown): Promise<StaffOrderEventRecordResult> {
    return firstValueFrom(
      this.api.post<StaffOrderEventRecordResult>(`/staff/orders/${orderId}/events`, body, {
        idempotent: true,
      }),
    );
  }
}
