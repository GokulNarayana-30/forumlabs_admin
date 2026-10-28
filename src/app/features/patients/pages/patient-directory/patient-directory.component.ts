import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../../../shared/ui/ui-button.component';
import { ToastService } from '../../../../shared/ui/toast.service';
import { errorText } from '../../../../core/api/error-text';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientDirectoryItem,
} from '../../services/patients.service';
import { PatientDetailViewComponent } from '../../components/patient-detail-view/patient-detail-view.component';

/**
 * Every patient, 25 a page, names and phones masked (super admin only). There is no export and no bigger page; a row
 * opens the normal patient view, which shows the full record and writes its own access-log entry.
 */
@Component({
  selector: 'app-patient-directory',
  standalone: true,
  imports: [CommonModule, RouterLink, UiButtonComponent, PatientDetailViewComponent],
  templateUrl: './patient-directory.component.html',
})
export class PatientDirectoryComponent implements OnInit {
  private readonly patientsService = inject(PatientsService);
  private readonly toast = inject(ToastService);

  readonly items = signal<StaffPatientDirectoryItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);
  readonly nextCursor = signal<string | null>(null);
  /** The cursors that led to the pages before this one, so Previous can go back (page 1 has the cursor ''). */
  private readonly history = signal<string[]>([]);
  private readonly currentCursor = signal<string>('');

  readonly pageNumber = computed(() => this.history().length + 1);
  readonly hasPrevious = computed(() => this.history().length > 0);
  readonly hasNext = computed(() => this.nextCursor() !== null);

  readonly selectedPatient = signal<StaffPatientDetail | null>(null);
  readonly detailVisible = signal<boolean>(false);

  ngOnInit(): void {
    void this.loadPage('');
  }

  private async loadPage(cursor: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const page = await this.patientsService.getDirectoryPage(cursor || undefined);
      this.items.set(page.items);
      this.nextCursor.set(page.next_cursor);
      this.currentCursor.set(cursor);
      this.loaded.set(true);
      return true;
    } catch (err: unknown) {
      this.toast.add({
        severity: 'error',
        summary: 'Directory Failed',
        detail: errorText(err, 'Failed to load the patient directory'),
      });
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  async next(): Promise<void> {
    const cursor = this.nextCursor();
    if (cursor === null || this.loading()) return;
    const from = this.currentCursor();
    if (await this.loadPage(cursor)) this.history.update((h) => [...h, from]);
  }

  async previous(): Promise<void> {
    const trail = this.history();
    if (trail.length === 0 || this.loading()) return;
    const target = trail[trail.length - 1]!;
    if (await this.loadPage(target)) this.history.set(trail.slice(0, -1));
  }

  async refresh(): Promise<void> {
    if (this.loading()) return;
    await this.loadPage(this.currentCursor());
  }

  async open(item: StaffPatientDirectoryItem): Promise<void> {
    this.loading.set(true);
    try {
      const detail = await this.patientsService.getPatientDetail(item.patient_id);
      this.selectedPatient.set(detail);
      this.detailVisible.set(true);
    } catch (err: unknown) {
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: errorText(err, 'Failed to load patient record'),
      });
    } finally {
      this.loading.set(false);
    }
  }

  statusClass(status: StaffPatientDirectoryItem['account_status']): string {
    switch (status) {
      case 'blocked':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'closed':
      case 'deleted':
        return 'bg-surface-100 text-surface-600 border-surface-300';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  }
}
