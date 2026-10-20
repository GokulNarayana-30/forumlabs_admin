import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DispatchService, DispatchTodayResult, DispatchVisit } from './dispatch.service';
import { AssignPhlebotomistModalComponent } from './assign-phlebotomist-modal.component';
import { errorText } from '../../core/api/error-text';

export function getIstTodayString(date: Date = new Date()): string {
  const istOffsetMs = 19_800_000; // 5.5 hours in ms (+05:30)
  const istDate = new Date(date.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

import { isAssignableStatus } from './assignable-status';
@Component({
  selector: 'app-dispatch-today',
  standalone: true,
  imports: [CommonModule, RouterModule, AssignPhlebotomistModalComponent],
  templateUrl: './dispatch-today.component.html',
})
export class DispatchTodayComponent implements OnInit {
  private readonly dispatchService = inject(DispatchService);

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly todayData = signal<DispatchTodayResult | null>(null);

  readonly activeTab = signal<'unassigned' | 'late' | 'unreceived'>('unassigned');

  readonly assignModalVisible = signal<boolean>(false);
  readonly assigningVisit = signal<DispatchVisit | null>(null);

  ngOnInit(): void {
    void this.loadToday();
  }

  async loadToday(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.dispatchService.getTodayMetrics();
      this.todayData.set(data);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to load dispatch operational data'));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Hidden once the sample is collected: the server refuses an assignment after that. */
  canAssign(visit: DispatchVisit): boolean {
    return isAssignableStatus(visit.status);
  }

  openAssignModal(visit: DispatchVisit): void {
    this.assigningVisit.set(visit);
    this.assignModalVisible.set(true);
  }

  async onAssigned(): Promise<void> {
    await this.loadToday();
  }
}
