import { Component, OnInit, OnChanges, SimpleChanges, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DoctorsService,
  StaffDoctorOptionItem,
  StaffOrderDoctorRef,
  StaffOrderDoctorResult,
} from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

@Component({
  selector: 'app-order-doctor-tag',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-4 rounded-xl border border-surface-200 bg-white shadow-xs space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold uppercase tracking-wider text-surface-500">
          Prescribing Doctor
        </h4>
        @if (sourceText()) {
          <span class="text-xs text-surface-500 italic">
            {{ sourceText() }}
          </span>
        }
      </div>

      @if (errorText()) {
        <div class="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {{ errorText() }}
        </div>
      }

      @if (statusMessage()) {
        <div class="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          {{ statusMessage() }}
        </div>
      }

      <!-- Current Effective Doctor Display -->
      <div class="flex items-center gap-2">
        @if (currentDoctor(); as doc) {
          <div class="space-y-0.5">
            <span data-testid="effective-doctor-name" class="text-sm font-bold text-surface-900">
              {{ doc.display_name }}
            </span>
            <span class="text-xs text-surface-500 block">{{ doc.department_name }}</span>
          </div>
        } @else {
          <span class="text-sm text-surface-500 italic">No doctor recorded</span>
        }
      </div>

      <!-- Staff Attribution Controls (D-05, D-13) -->
      <div class="pt-2 border-t border-surface-100 flex flex-col sm:flex-row gap-2">
        <select
          data-testid="order-doctor-select"
          [(ngModel)]="selectedDoctorId"
          (change)="onSelectChange($event)"
          class="flex-1 rounded-md border border-surface-300 px-3 py-1.5 text-xs shadow-xs focus:border-surface-500 focus:outline-none"
        >
          <option value="" disabled>Select Doctor</option>
          @for (opt of doctorOptions(); track opt.id) {
            <option [value]="opt.id">{{ opt.display_name }} ({{ opt.department_name }})</option>
          }
        </select>

        <div class="flex items-center gap-2">
          <button
            type="button"
            data-testid="save-order-doctor-btn"
            [disabled]="saving()"
            (click)="saveDoctor()"
            class="px-3 py-1.5 text-xs font-medium text-white bg-surface-900 rounded-md hover:bg-surface-800 disabled:opacity-50"
          >
            {{ saving() ? 'Saving...' : 'Save' }}
          </button>
          <button
            type="button"
            data-testid="clear-order-doctor-btn"
            [disabled]="saving() || !currentDoctor()"
            (click)="clearDoctor()"
            class="px-3 py-1.5 text-xs font-medium text-surface-700 bg-white border border-surface-300 rounded-md hover:bg-surface-50 disabled:opacity-50"
          >
            Clear doctor
          </button>
        </div>
      </div>
    </div>
  `,
})
export class OrderDoctorTagComponent implements OnInit, OnChanges {
  private readonly doctorsService = inject(DoctorsService);

  readonly orderId = input.required<string>();

  readonly currentDoctor = signal<StaffOrderDoctorRef | null>(null);
  readonly currentSource = signal<'doctor_code' | 'customer_selected' | 'staff_tag' | null>(null);
  readonly doctorOptions = signal<StaffDoctorOptionItem[]>([]);

  readonly saving = signal(false);
  readonly errorText = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);

  selectedDoctorId = '';
  private loadGen = 0;

  get sourceText(): () => string {
    return () => {
      const src = this.currentSource();
      if (!this.currentDoctor()) return '';
      switch (src) {
        case 'doctor_code':
          return "From the customer's doctor code";
        case 'customer_selected':
          return 'Chosen by the customer';
        case 'staff_tag':
          return 'Set by staff';
        default:
          return '';
      }
    };
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['orderId'] && !changes['orderId'].firstChange) {
      await this.loadData();
    }
  }

  onSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target?.value) {
      this.selectedDoctorId = target.value;
    }
  }

  async loadData(): Promise<void> {
    const oid = this.orderId();
    if (!oid) return;

    const gen = ++this.loadGen;
    this.errorText.set(null);
    this.statusMessage.set(null);

    try {
      const [orderDocRes, optionsRes] = await Promise.all([
        this.doctorsService.getOrderDoctor(oid),
        this.doctorsService.listOptions(),
      ]);

      if (gen === this.loadGen) {
        this.currentDoctor.set(orderDocRes.doctor);
        this.currentSource.set(orderDocRes.source);
        this.doctorOptions.set(optionsRes.doctors);
        this.selectedDoctorId = orderDocRes.doctor?.id ?? optionsRes.doctors[0]?.id ?? '';
      }
    } catch (err: unknown) {
      if (gen === this.loadGen) {
        this.errorText.set(
          err instanceof Error ? err.message : 'Failed to load doctor attribution.',
        );
      }
    }
  }

  async saveDoctor(): Promise<void> {
    const oid = this.orderId();
    if (!oid || this.saving()) return;
    const gen = this.loadGen;
    this.errorText.set(null);
    this.statusMessage.set(null);

    const docId = this.selectedDoctorId || null;
    this.saving.set(true);

    try {
      const res = await this.doctorsService.setOrderDoctor(oid, docId);
      if (oid !== this.orderId() || gen !== this.loadGen) return;
      if (res.kind !== 'order_doctor_set') {
        this.errorText.set('That doctor is not available. Pick another.');
        return;
      }
      this.currentDoctor.set(res.doctor);
      this.currentSource.set(res.source);

      if (res.changed) {
        this.statusMessage.set('Doctor saved.');
      } else {
        this.statusMessage.set('No change.');
      }
    } catch (err: unknown) {
      if (oid !== this.orderId() || gen !== this.loadGen) return;
      if (
        err instanceof ApiClientError &&
        (err.code === 'doctor_inactive' || err.code === 'doctor_not_found')
      ) {
        this.errorText.set('That doctor is not available. Pick another.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to save doctor.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async clearDoctor(): Promise<void> {
    const oid = this.orderId();
    if (!oid || this.saving()) return;
    const gen = this.loadGen;
    this.errorText.set(null);
    this.statusMessage.set(null);

    this.saving.set(true);
    try {
      const res = await this.doctorsService.setOrderDoctor(oid, null);
      if (oid !== this.orderId() || gen !== this.loadGen) return;
      if (res.kind !== 'order_doctor_set') {
        this.errorText.set('That doctor is not available. Pick another.');
        return;
      }
      this.currentDoctor.set(res.doctor);
      this.currentSource.set(res.source);
      this.selectedDoctorId = '';
      if (res.changed) {
        this.statusMessage.set('Doctor saved.');
      } else {
        this.statusMessage.set('No change.');
      }
    } catch (err: unknown) {
      if (oid !== this.orderId() || gen !== this.loadGen) return;
      this.errorText.set(err instanceof Error ? err.message : 'Failed to clear doctor.');
    } finally {
      this.saving.set(false);
    }
  }
}
