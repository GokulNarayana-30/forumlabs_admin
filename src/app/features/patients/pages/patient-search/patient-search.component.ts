import { UiButtonComponent } from '../../../../shared/ui/ui-button.component';
import { ToastService } from '../../../../shared/ui/toast.service';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PatientsService,
  PatientSearchType,
  StaffPatientSearchResult,
  StaffPatientDetail,
} from '../../services/patients.service';
import { PatientDetailViewComponent } from '../../components/patient-detail-view/patient-detail-view.component';
import { errorText } from '../../../../core/api/error-text';

export interface SearchTypeOption {
  label: string;
  value: PatientSearchType;
  placeholder: string;
}

@Component({
  selector: 'app-patient-search',
  standalone: true,
  imports: [CommonModule, FormsModule, UiButtonComponent, PatientDetailViewComponent],
  templateUrl: './patient-search.component.html',
})
export class PatientSearchComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly messageService = inject(ToastService);

  readonly searchTypeOptions: SearchTypeOption[] = [
    { label: 'Patient ID', value: 'patient_id', placeholder: 'e.g. FL-P-104928' },
    { label: 'Phone Number', value: 'phone', placeholder: 'e.g. 9876543210' },
    { label: 'Booking Ref', value: 'booking_ref', placeholder: 'e.g. BK-1001 or FL-2026-...' },
    { label: 'Ticket Ref', value: 'ticket_ref', placeholder: 'e.g. TKT-1001 or TK-2026-...' },
    { label: 'LabSmart Reg No', value: 'reg_no', placeholder: 'e.g. REG-10492' },
    { label: 'Patient Name', value: 'name', placeholder: 'Enter at least 3 letters' },
  ];

  readonly searchType = signal<PatientSearchType>('patient_id');
  readonly searchQuery = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly results = signal<StaffPatientSearchResult[]>([]);
  readonly searchExecuted = signal<boolean>(false);
  readonly ticketRefNotice = signal<string>('');

  // Patient detail inspection
  readonly selectedPatient = signal<StaffPatientDetail | null>(null);
  readonly detailVisible = signal<boolean>(false);

  isQueryValid(): boolean {
    const q = this.searchQuery().trim();
    if (!q) {
      return false;
    }
    if (this.searchType() === 'name') {
      return q.length >= 3;
    }
    return true;
  }

  validationError(): string {
    const q = this.searchQuery().trim();
    if (this.searchType() === 'name' && q && q.length < 3) {
      return 'Name search requires at least 3 characters.';
    }
    return '';
  }

  get currentPlaceholder(): string {
    const opt = this.searchTypeOptions.find((o) => o.value === this.searchType());
    return opt?.placeholder || 'Enter search query';
  }

  onTypeChange(newType: PatientSearchType): void {
    this.searchType.set(newType);
    this.ticketRefNotice.set('');
  }

  async executeSearch(): Promise<void> {
    if (!this.isQueryValid()) {
      return;
    }

    this.loading.set(true);
    this.ticketRefNotice.set('');
    this.searchExecuted.set(true);

    try {
      const type = this.searchType();
      const query = this.searchQuery().trim();
      const res = await this.patientsService.search(query, type);
      this.results.set(res);

      if (type === 'ticket_ref') {
        this.ticketRefNotice.set(
          'Ticket reference search will be active in Phase 12 support desk integration.',
        );
      }
    } catch (err: unknown) {
      this.messageService.add({
        severity: 'error',
        summary: 'Search Failed',
        detail: errorText(err, 'Failed to search patients'),
      });
      this.results.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async selectPatient(result: StaffPatientSearchResult): Promise<void> {
    this.loading.set(true);
    try {
      const detail = await this.patientsService.getPatientDetail(result.patient_id);
      this.selectedPatient.set(detail);
      this.detailVisible.set(true);
    } catch (err: unknown) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: errorText(err, 'Failed to load patient record'),
      });
    } finally {
      this.loading.set(false);
    }
  }

  closeDetail(): void {
    this.detailVisible.set(false);
    this.selectedPatient.set(null);
  }
}
