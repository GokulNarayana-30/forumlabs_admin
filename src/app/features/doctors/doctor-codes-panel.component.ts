import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  DoctorsService,
  StaffDoctorDetail,
  StaffDoctorCode,
  StaffDoctorSettingsResult,
} from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

@Component({
  selector: 'app-doctor-codes-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="space-y-6">
      @if (errorText()) {
        <div class="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {{ errorText() }}
        </div>
      }

      <!-- Generate Code Block -->
      <div class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <h4 class="text-sm font-semibold text-slate-900">Generate Referral Code</h4>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            data-testid="code-label-input"
            [(ngModel)]="newCodeLabel"
            maxlength="80"
            placeholder="Location label (optional, e.g. Room 102)"
            class="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            data-testid="generate-code-btn"
            [disabled]="saving() || !doctor()"
            (click)="generateCode()"
            class="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {{ saving() ? 'Generating...' : 'Generate code' }}
          </button>
        </div>
      </div>

      <!-- Codes List -->
      <div class="space-y-3">
        <h4 class="text-sm font-semibold text-slate-900">Existing Codes</h4>
        @if (!doctor() || doctor()!.codes.length === 0) {
          <p class="text-xs text-slate-500 text-center py-4">No codes generated yet.</p>
        } @else {
          <div class="space-y-3">
            @for (c of doctor()!.codes; track c.id) {
              <div
                class="p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span
                      [attr.data-testid]="'code-display-' + c.id"
                      class="font-mono text-xl tracking-wider font-bold text-slate-900"
                    >
                      <span [attr.data-testid]="'doctor-code-' + c.code" class="font-mono">{{
                        c.code
                      }}</span>
                    </span>
                    <span
                      class="text-xs px-2 py-0.5 rounded font-medium"
                      [ngClass]="
                        c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      "
                    >
                      {{ c.active ? 'Active' : 'Inactive' }}
                    </span>
                  </div>
                  @if (c.location_label) {
                    <p class="text-xs text-slate-500">{{ c.location_label }}</p>
                  }
                </div>

                <div class="flex items-center gap-3">
                  @if (c.active) {
                    <a
                      [attr.data-testid]="'print-card-link-' + c.id"
                      [routerLink]="['/doctors/card', doctor()!.id, c.id]"
                      class="px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100"
                    >
                      Print card
                    </a>
                  } @else {
                    <span class="text-xs text-slate-500 italic">
                      Switch the code on to print its card.
                    </span>
                  }
                  <button
                    type="button"
                    [attr.data-testid]="'toggle-code-btn-' + c.id"
                    [disabled]="saving()"
                    (click)="toggleCodeActive(c)"
                    class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    {{ c.active ? 'Switch off' : 'Switch on' }}
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Card Link Base URL Setting Block (D-15) -->
      <div class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <h4 class="text-sm font-semibold text-slate-900">Card Link Web Address</h4>
        <p class="text-xs text-slate-500">
          Leave this empty until the website domain is decided. Cards then show the code only.
        </p>
        <div class="text-xs text-slate-700">
          Current base:
          <span class="font-mono font-medium">{{ currentBaseUrl() || 'Not set' }}</span>
        </div>

        @if (settingsError()) {
          <div class="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {{ settingsError() }}
          </div>
        }

        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            data-testid="card-link-base-input"
            [(ngModel)]="cardLinkBaseInput"
            placeholder="e.g. https://forumlabs.in"
            class="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            data-testid="save-card-link-base-btn"
            [disabled]="saving()"
            (click)="saveCardLinkBase()"
            class="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {{ saving() ? 'Saving...' : 'Save setting' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DoctorCodesPanelComponent implements OnInit {
  private readonly doctorsService = inject(DoctorsService);

  readonly doctor = input<StaffDoctorDetail | null>(null);
  readonly changed = output<void>();

  readonly currentBaseUrl = signal<string | null>(null);
  readonly saving = signal(false);
  readonly errorText = signal<string | null>(null);
  readonly settingsError = signal<string | null>(null);

  newCodeLabel = '';
  cardLinkBaseInput = '';

  async ngOnInit(): Promise<void> {
    await this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      const res = await this.doctorsService.getSettings();
      this.currentBaseUrl.set(res.card_link_base_url);
      this.cardLinkBaseInput = res.card_link_base_url ?? '';
    } catch {
      // Fallback
    }
  }

  async generateCode(): Promise<void> {
    const doc = this.doctor();
    if (!doc || this.saving()) return;
    this.errorText.set(null);

    const label = this.newCodeLabel.trim();
    this.saving.set(true);
    try {
      const result = await this.doctorsService.createCode(doc.id, {
        location_label: label ? label.slice(0, 80) : null,
      });
      if (result.kind !== 'doctor_code_created') {
        this.errorText.set('Switch the doctor on before creating a code.');
        return;
      }
      this.newCodeLabel = '';
      this.changed.emit();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'doctor_inactive') {
        this.errorText.set('Switch the doctor on before creating a code.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to generate code.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async toggleCodeActive(code: StaffDoctorCode): Promise<void> {
    const doc = this.doctor();
    if (!doc || this.saving()) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      await this.doctorsService.updateCode(doc.id, code.id, {
        active: !code.active,
      });
      this.changed.emit();
    } catch (err: unknown) {
      this.errorText.set(err instanceof Error ? err.message : 'Failed to update code.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveCardLinkBase(): Promise<void> {
    if (this.saving()) return;
    this.settingsError.set(null);

    const raw = this.cardLinkBaseInput.trim();
    const payload = raw.length > 0 ? raw : null;

    this.saving.set(true);
    try {
      const res = await this.doctorsService.updateSettings({
        card_link_base_url: payload,
      });
      this.currentBaseUrl.set(res.card_link_base_url);
      this.cardLinkBaseInput = res.card_link_base_url ?? '';
    } catch (err: unknown) {
      this.settingsError.set(err instanceof Error ? err.message : 'Failed to update setting.');
    } finally {
      this.saving.set(false);
    }
  }
}
