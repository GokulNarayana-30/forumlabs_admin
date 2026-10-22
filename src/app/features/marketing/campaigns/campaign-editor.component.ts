import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StaffStateService } from '../../../core/state/staff-state.service';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { imageUrlProblem } from '../image-url';
import { istInputToInstant } from '../ist-datetime';
import { marketingErrorMessage } from '../marketing-errors';
import { parsePincodes } from '../pincodes';
import {
  CampaignsService,
  CampaignItem,
  CampaignPolicyDto,
  CampaignPreviewDto,
  TestDeviceItem,
  CampaignLinkKind,
  CampaignAudienceDto,
  CampaignAudienceZoneDto,
  AudienceEstimateDto,
  CreateCampaignDto,
} from './campaigns.service';

/** "Any" leaves the predicate out; "yes" and "no" are both real restrictions and must round-trip. */
export type Tristate = 'any' | 'yes' | 'no';

export interface ZoneRow {
  id: string;
  pincodesText: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const PATIENT_ID = /^FL-P-\d{6}$/;

function tristateOf(value: boolean | undefined): Tristate {
  return value === true ? 'yes' : value === false ? 'no' : 'any';
}

function tristateToBool(value: Tristate): boolean | undefined {
  return value === 'yes' ? true : value === 'no' ? false : undefined;
}

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent],
  templateUrl: './campaign-editor.component.html',
})
export class CampaignEditorComponent implements OnInit {
  private readonly campaignsService = inject(CampaignsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly staffState = inject(StaffStateService);

  /** Super admins may send without a test send; the API enforces the same rule. */
  canSkipTest(): boolean {
    return this.staffState.hasRole('super_admin');
  }

  campaignId: string | null = null;
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly estimating = signal<boolean>(false);
  readonly testSending = signal<boolean>(false);
  readonly scheduling = signal<boolean>(false);
  readonly previewing = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly csvError = signal<string | null>(null);

  readonly policy = signal<CampaignPolicyDto | null>(null);
  readonly policyError = signal<string | null>(null);
  readonly testDevices = signal<TestDeviceItem[]>([]);
  readonly selectedDeviceIds = signal<string[]>([]);
  readonly estimate = signal<AudienceEstimateDto | null>(null);
  /** The server's own preview of the SAVED revision: character counts and truncation warnings. */
  readonly serverPreview = signal<CampaignPreviewDto | null>(null);

  /** The form differs from what the server holds. A new campaign starts dirty. */
  readonly dirty = signal<boolean>(true);
  /** The revision the server holds for this campaign (after the last load or save). */
  readonly savedRevision = signal<number | null>(null);
  /** The revision that has a recorded own-device test. */
  readonly testedRevision = signal<number | null>(null);
  private lastSaved: CampaignItem | null = null;

  /**
   * Scheduling is allowed only while the form is exactly what was saved AND that saved revision was
   * tested. Any save that changes the revision (or any edit) withdraws the confirmation.
   */
  readonly testSendSuccess = computed(
    () =>
      !this.dirty() &&
      this.savedRevision() !== null &&
      this.testedRevision() === this.savedRevision(),
  );

  /** The approval threshold applies to the eligible count the estimate returned. */
  readonly requiresApproval = computed(() => {
    const est = this.estimate();
    const policy = this.policy();
    return est !== null && policy !== null && est.estimated_count > policy.approval_threshold;
  });

  /** The push configuration state from policy.push_connected. */
  readonly pushStateMessage = computed(() => {
    const connected = this.policy()?.push_connected;
    if (connected === true) {
      return 'Push is configured: test sends go to your registered devices.';
    }
    if (connected === false) {
      return 'Push is not connected yet: test send and scheduling are unavailable.';
    }
    return null;
  });

  /** One id per test attempt of a revision: a retry of the same saved revision replays, never re-sends. */
  requestId = crypto.randomUUID();

  readonly linkKinds: CampaignLinkKind[] = [
    'home',
    'package',
    'tests',
    'category',
    'item',
    'coupon',
    'support',
    'bookings',
    'reports_list',
  ];

  form = {
    name: '',
    title: '',
    body: '',
    imageUrl: '',
    linkKind: 'home' as CampaignLinkKind,
    linkTargetId: '',
    respectQuietHours: true,
    onQuietHours: 'defer' as 'defer' | 'skip',
    sendOption: 'now' as 'now' | 'later',
    sendAtDate: '',
    sendAtTime: '',
    audience: {
      all_consented: true,
      pincodesText: '',
      zones: [] as ZoneRow[],
      platform: 'all' as 'all' | 'android' | 'ios',
      min_app_version: '',
      last_booking_before_days: null as number | null,
      last_booking_within_days: null as number | null,
      never_booked: 'any' as Tristate,
      has_upcoming_booking: 'any' as Tristate,
      patient_ids: [] as string[],
      patientIdsCsvText: '',
    },
  };

  /** Why the image URL cannot be used, by the same rule the API applies; null when it is fine or empty. */
  imageProblem(): string | null {
    const url = this.form.imageUrl.trim();
    if (!url) return null;
    const policy = this.policy();
    if (!policy) return this.policyError() ?? 'Image rules are still loading.';
    return imageUrlProblem(url, policy.allowed_image_hosts);
  }

  ngOnInit(): void {
    this.loadPolicy();
    this.loadTestDevices();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.campaignId = id;
      this.loadCampaign(id);
    }
  }

  loadPolicy(): void {
    this.policyError.set(null);
    this.campaignsService.getPolicy().subscribe({
      next: (policy) => {
        this.policy.set(policy);
      },
      error: (err) => {
        this.policyError.set(
          marketingErrorMessage(err, 'The approval policy could not be loaded.'),
        );
      },
    });
  }

  loadTestDevices(): void {
    this.campaignsService.getTestDevices().subscribe({
      next: (res) => {
        this.testDevices.set(res.devices);
      },
      error: () => {
        this.testDevices.set([]);
      },
    });
  }

  loadCampaign(id: string): void {
    this.loading.set(true);
    this.campaignsService.getCampaign(id).subscribe({
      next: (item) => {
        this.form.name = item.name;
        this.form.title = item.title;
        this.form.body = item.body;
        this.form.imageUrl = item.imageUrl || '';
        this.form.linkKind = item.linkKind;
        this.form.linkTargetId = item.linkTargetId || '';
        this.form.respectQuietHours = item.respectQuietHours;
        this.form.onQuietHours = item.onQuietHours;

        if (item.audience) {
          const aud = item.audience;
          this.form.audience.all_consented = aud.all_consented ?? true;
          this.form.audience.pincodesText = (aud.pincodes || []).join(', ');
          this.form.audience.zones = (aud.zones || []).map((z) => ({
            id: z.id,
            pincodesText: z.pincodes.join(', '),
          }));
          this.form.audience.platform = aud.platform || 'all';
          this.form.audience.min_app_version = aud.min_app_version || '';
          this.form.audience.last_booking_before_days = aud.last_booking_before_days ?? null;
          this.form.audience.last_booking_within_days = aud.last_booking_within_days ?? null;
          this.form.audience.never_booked = tristateOf(aud.never_booked);
          this.form.audience.has_upcoming_booking = tristateOf(aud.has_upcoming_booking);
          this.form.audience.patient_ids = aud.patient_ids || [];
          this.form.audience.patientIdsCsvText = (aud.patient_ids || []).join('\n');
        }

        this.markSaved(item);
        const tests = item.test_sends ?? [];
        this.testedRevision.set(
          tests.some((t) => t.revision === item.revision) ? item.revision : null,
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(marketingErrorMessage(err, 'Failed to load campaign'));
      },
    });
  }

  /** The server now holds exactly the form: remember its revision and start a fresh test attempt. */
  private markSaved(item: CampaignItem): void {
    this.lastSaved = item;
    this.savedRevision.set(item.revision);
    this.dirty.set(false);
    this.requestId = crypto.randomUUID();
  }

  /** Any edit: the form no longer matches the saved revision, so confirmations and results are void. */
  onFormChange(): void {
    this.dirty.set(true);
    this.estimate.set(null);
    this.serverPreview.set(null);
  }

  parsePatientIdsCsv(csvContent: string): void {
    this.onFormChange();
    // The saved list always matches what is typed: a rejected text leaves no stale IDs behind.
    this.form.audience.patient_ids = [];

    if (!csvContent || !csvContent.trim()) {
      this.csvError.set(null);
      return;
    }

    const entries = csvContent
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const invalidCount = entries.filter((id) => !PATIENT_ID.test(id)).length;
    if (invalidCount > 0) {
      // Never log or leak the ID values themselves.
      this.csvError.set(
        `Invalid patient ID format found in ${invalidCount} row(s). Each ID must be FL-P-XXXXXX.`,
      );
      return;
    }

    const deduped = Array.from(new Set(entries));
    if (deduped.length > 1000) {
      this.csvError.set('Maximum 1,000 patient IDs allowed per campaign.');
      return;
    }

    this.form.audience.patient_ids = deduped;
    this.csvError.set(null);
  }

  addZone(): void {
    if (this.form.audience.zones.length >= 20) return;
    this.form.audience.zones = [...this.form.audience.zones, { id: '', pincodesText: '' }];
    this.onFormChange();
  }

  removeZone(index: number): void {
    this.form.audience.zones = this.form.audience.zones.filter((_, i) => i !== index);
    this.onFormChange();
  }

  /**
   * The first thing wrong with the audience inputs, in words, or null. A malformed restriction is
   * never dropped: the audience would silently become wider than the staff member meant.
   */
  audienceProblem(): string | null {
    const aud = this.form.audience;

    const pins = parsePincodes(aud.pincodesText);
    if (pins.invalid.length > 0) {
      return `Not a valid pincode: ${pins.invalid.join(', ')}. Pincodes have six digits and do not start with 0.`;
    }
    if (pins.pincodes.length > 100) return 'At most 100 pincodes are allowed.';

    for (const [i, zone] of aud.zones.entries()) {
      if (!zone.id.trim()) return `Zone ${i + 1} needs a name.`;
      const parsed = parsePincodes(zone.pincodesText);
      if (parsed.invalid.length > 0) {
        return `Zone ${i + 1} has an invalid pincode: ${parsed.invalid.join(', ')}.`;
      }
      if (parsed.pincodes.length === 0) return `Zone ${i + 1} needs at least one pincode.`;
      if (parsed.pincodes.length > 100) return `Zone ${i + 1} can have at most 100 pincodes.`;
    }

    if (aud.min_app_version.trim() && !VERSION.test(aud.min_app_version.trim())) {
      return 'Minimum app version must look like 2.1.0.';
    }

    const before = aud.last_booking_before_days;
    const within = aud.last_booking_within_days;
    for (const days of [before, within]) {
      if (days !== null && days !== undefined && !(Number.isInteger(days) && days >= 1)) {
        return 'Booking day counts must be whole numbers of at least 1.';
      }
    }
    if (aud.never_booked === 'yes' && (before || within)) {
      return '"Never booked" cannot be combined with a last-booking day count.';
    }
    if (before && within && before >= within) {
      return '"Last booking before" must be fewer days than "last booking within".';
    }

    if (this.csvError()) return this.csvError();
    return null;
  }

  buildAudiencePayload(): CampaignAudienceDto {
    const aud = this.form.audience;
    const payload: CampaignAudienceDto = {};

    if (aud.all_consented) {
      payload.all_consented = true;
    }

    const pins = parsePincodes(aud.pincodesText).pincodes;
    if (pins.length > 0) {
      payload.pincodes = pins;
    }

    if (aud.zones.length > 0) {
      payload.zones = aud.zones.map((z): CampaignAudienceZoneDto => ({
        id: z.id.trim(),
        pincodes: parsePincodes(z.pincodesText).pincodes,
      }));
    }

    if (aud.platform !== 'all') {
      payload.platform = aud.platform;
    }

    if (aud.min_app_version && aud.min_app_version.trim()) {
      payload.min_app_version = aud.min_app_version.trim();
    }

    if (aud.last_booking_before_days) {
      payload.last_booking_before_days = Number(aud.last_booking_before_days);
    }
    if (aud.last_booking_within_days) {
      payload.last_booking_within_days = Number(aud.last_booking_within_days);
    }

    const neverBooked = tristateToBool(aud.never_booked);
    if (neverBooked !== undefined) payload.never_booked = neverBooked;

    const upcoming = tristateToBool(aud.has_upcoming_booking);
    if (upcoming !== undefined) payload.has_upcoming_booking = upcoming;

    if (aud.patient_ids.length > 0) {
      payload.patient_ids = aud.patient_ids;
    }

    return payload;
  }

  /**
   * Saves the form, then calls `callback` with the saved campaign. A form that has not changed since
   * the last save is NOT sent again: every save bumps the revision on the server, which would void
   * the test confirmation for no reason.
   */
  saveDraft(callback?: (campaign: CampaignItem) => void, onFail?: () => void): void {
    this.errorMessage.set(null);

    const problem = this.audienceProblem() ?? this.imageProblem();
    if (problem) {
      this.errorMessage.set(problem);
      if (onFail) onFail();
      return;
    }

    if (this.campaignId && !this.dirty() && this.lastSaved) {
      if (callback) callback(this.lastSaved);
      return;
    }

    this.saving.set(true);

    const payload: CreateCampaignDto = {
      name: this.form.name,
      title: this.form.title,
      body: this.form.body,
      imageUrl: this.form.imageUrl.trim() || null,
      linkKind: this.form.linkKind,
      linkTargetId: this.form.linkTargetId.trim() || null,
      audience: this.buildAudiencePayload(),
      respectQuietHours: true,
      onQuietHours: this.form.onQuietHours,
    };

    const done = (saved: CampaignItem) => {
      this.campaignId = saved.id;
      this.markSaved(saved);
      this.saving.set(false);
      if (callback) callback(saved);
    };

    if (!this.campaignId) {
      this.campaignsService.createCampaign(payload).subscribe({
        next: done,
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(marketingErrorMessage(err, 'Failed to create campaign draft'));
          if (onFail) onFail();
        },
      });
    } else {
      this.campaignsService.updateCampaign(this.campaignId, payload).subscribe({
        next: done,
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(marketingErrorMessage(err, 'Failed to update campaign draft'));
          if (onFail) onFail();
        },
      });
    }
  }

  estimateAudience(): void {
    this.estimating.set(true);
    this.errorMessage.set(null);

    const proceed = (camp: CampaignItem) => {
      this.campaignsService.estimateAudience(camp.id).subscribe({
        next: (est) => {
          this.estimate.set(est);
          this.estimating.set(false);
        },
        error: (err) => {
          this.estimating.set(false);
          this.errorMessage.set(marketingErrorMessage(err, 'Failed to estimate audience'));
        },
      });
    };

    this.saveDraft(proceed, () => this.estimating.set(false));
  }

  /** The server's preview of the saved revision, with its truncation warnings. */
  loadServerPreview(): void {
    this.previewing.set(true);
    this.errorMessage.set(null);

    const proceed = (camp: CampaignItem) => {
      this.campaignsService.getPreview(camp.id).subscribe({
        next: (preview) => {
          this.serverPreview.set(preview);
          this.previewing.set(false);
        },
        error: (err) => {
          this.previewing.set(false);
          this.errorMessage.set(marketingErrorMessage(err, 'Failed to load the preview'));
        },
      });
    };

    this.saveDraft(proceed, () => this.previewing.set(false));
  }

  toggleDeviceSelection(deviceId: string): void {
    const current = this.selectedDeviceIds();
    if (current.includes(deviceId)) {
      this.selectedDeviceIds.set(current.filter((id) => id !== deviceId));
    } else {
      if (current.length >= 5) return;
      this.selectedDeviceIds.set([...current, deviceId]);
    }
  }

  runTestSend(): void {
    if (this.policy()?.push_connected === false) return;
    const devices = this.selectedDeviceIds();
    if (devices.length === 0) return;

    this.testSending.set(true);
    this.errorMessage.set(null);

    const proceed = (camp: CampaignItem) => {
      const revision = camp.revision;
      const requestId = this.requestId;
      this.campaignsService.testSend(camp.id, { deviceIds: devices, requestId }).subscribe({
        next: (res) => {
          this.testSending.set(false);
          // Confirmed only when the server recorded this attempt for exactly the saved revision.
          const recorded = res.test_sends.some(
            (t) => t.requestId === requestId && t.revision === revision,
          );
          if (recorded && this.savedRevision() === revision && !this.dirty()) {
            this.testedRevision.set(revision);
          } else if (!recorded) {
            this.errorMessage.set('The test send was not recorded for this revision. Try again.');
          }
        },
        error: (err) => {
          this.testSending.set(false);
          this.errorMessage.set(marketingErrorMessage(err, 'Test send failed'));
        },
      });
    };

    this.saveDraft(proceed, () => this.testSending.set(false));
  }

  /** Why "Schedule" cannot be pressed for the chosen send time, in words, or null when it can. */
  scheduleProblem(): string | null {
    if (this.form.sendOption !== 'later') return null;
    if (!this.form.sendAtDate || !this.form.sendAtTime) {
      return 'Choose both a date and a time (IST) to schedule later.';
    }
    const instant = istInputToInstant(`${this.form.sendAtDate}T${this.form.sendAtTime}`);
    if (!instant) return 'The date or time is not valid.';
    if (Date.parse(instant) <= Date.now()) return 'The scheduled time must be in the future (IST).';
    return null;
  }

  scheduleOrSend(): void {
    if (
      !this.campaignId ||
      !(this.testSendSuccess() || this.canSkipTest()) ||
      this.policy()?.push_connected === false
    )
      return;

    const problem = this.scheduleProblem();
    if (problem) {
      this.errorMessage.set(problem);
      return;
    }

    this.scheduling.set(true);
    this.errorMessage.set(null);

    const sendAt =
      this.form.sendOption === 'later'
        ? istInputToInstant(`${this.form.sendAtDate}T${this.form.sendAtTime}`)
        : null;

    this.campaignsService.scheduleCampaign(this.campaignId, sendAt ? { sendAt } : {}).subscribe({
      next: () => {
        this.scheduling.set(false);
        this.router.navigate(['/marketing/campaigns']);
      },
      error: (err) => {
        this.scheduling.set(false);
        this.errorMessage.set(marketingErrorMessage(err, 'Failed to schedule campaign'));
      },
    });
  }
}
