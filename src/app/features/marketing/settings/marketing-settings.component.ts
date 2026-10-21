import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { MarketingSettingsService, MarketingSettingsDto } from './marketing-settings.service';
import { marketingErrorMessage } from '../marketing-errors';
import { StaffStateService } from '../../../core/state/staff-state.service';

const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_INT = 2_147_483_647;

@Component({
  selector: 'app-marketing-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent],
  templateUrl: './marketing-settings.component.html',
})
export class MarketingSettingsComponent implements OnInit {
  private readonly settingsService = inject(MarketingSettingsService);
  private readonly staffState = inject(StaffStateService);

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly savedSuccess = signal<boolean>(false);
  readonly validationError = signal<string | null>(null);
  /** The settings could not be read; saving stays off so invented defaults are never written back. */
  readonly loadError = signal<string | null>(null);
  readonly loaded = signal<boolean>(false);

  isSuperAdmin(): boolean {
    return this.staffState.roles().includes('super_admin');
  }

  form = {
    approvalThreshold: 5000,
    perUserDailyCap: 1,
    perUserWeeklyCap: 3,
    // The window in which marketing pushes may be sent. It can only be narrowed inside 10:00-20:00 IST.
    quietHoursStart: '10:00',
    quietHoursEnd: '20:00',
    allowedImageHosts: [] as string[],
    allowedImageHostsText: '',
  };

  ngOnInit(): void {
    if (this.isSuperAdmin()) {
      this.loadSettings();
    } else {
      this.loading.set(false);
    }
  }

  loadSettings(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.settingsService.getSettings().subscribe({
      next: (s) => {
        this.form.approvalThreshold = s.approvalThreshold;
        this.form.perUserDailyCap = s.perUserDailyCap;
        this.form.perUserWeeklyCap = s.perUserWeeklyCap;
        this.form.quietHoursStart = s.quietHoursStart;
        this.form.quietHoursEnd = s.quietHoursEnd;
        this.form.allowedImageHosts = s.allowedImageHosts;
        this.form.allowedImageHostsText = s.allowedImageHosts.join('\n');
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(marketingErrorMessage(err, 'Marketing settings could not be loaded.'));
      },
    });
  }

  save(): void {
    this.validationError.set(null);
    this.savedSuccess.set(false);

    if (!this.loaded()) return;

    // 1. Whole numbers the database can hold; weekly may not be below daily
    const limits = [
      this.form.approvalThreshold,
      this.form.perUserDailyCap,
      this.form.perUserWeeklyCap,
    ];
    if (!limits.every((n) => Number.isSafeInteger(n) && n >= 1 && n <= MAX_INT)) {
      this.validationError.set('Threshold and frequency caps must be whole numbers of at least 1.');
      return;
    }
    if (this.form.perUserWeeklyCap < this.form.perUserDailyCap) {
      this.validationError.set('The weekly cap cannot be lower than the daily cap.');
      return;
    }

    // 2. Sending window: zero-padded HH:MM, only ever narrowing 10:00-20:00 IST, start before end
    const start = this.form.quietHoursStart;
    const end = this.form.quietHoursEnd;
    if (!HH_MM.test(start) || !HH_MM.test(end)) {
      this.validationError.set('Times must be written as HH:MM, for example 10:00.');
      return;
    }
    if (start < '10:00' || end > '20:00' || start >= end) {
      this.validationError.set(
        'The sending window must lie between 10:00 and 20:00 IST, and start before it ends.',
      );
      return;
    }

    // 3. Hosts parsing
    const hosts = this.form.allowedImageHostsText
      .split(/[\r\n,]+/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const payload: Partial<MarketingSettingsDto> = {
      approvalThreshold: Number(this.form.approvalThreshold),
      perUserDailyCap: Number(this.form.perUserDailyCap),
      perUserWeeklyCap: Number(this.form.perUserWeeklyCap),
      quietHoursStart: this.form.quietHoursStart,
      quietHoursEnd: this.form.quietHoursEnd,
      allowedImageHosts: hosts,
    };

    this.saving.set(true);
    this.settingsService.updateSettings(payload).subscribe({
      next: (updated) => {
        this.form.approvalThreshold = updated.approvalThreshold;
        this.form.perUserDailyCap = updated.perUserDailyCap;
        this.form.perUserWeeklyCap = updated.perUserWeeklyCap;
        this.form.quietHoursStart = updated.quietHoursStart;
        this.form.quietHoursEnd = updated.quietHoursEnd;
        this.form.allowedImageHosts = updated.allowedImageHosts;
        this.form.allowedImageHostsText = updated.allowedImageHosts.join('\n');
        this.saving.set(false);
        this.savedSuccess.set(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.validationError.set(
          marketingErrorMessage(err, 'Failed to update marketing settings.'),
        );
      },
    });
  }
}
