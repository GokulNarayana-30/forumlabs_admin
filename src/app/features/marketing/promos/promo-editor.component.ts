import { imageUrlProblem } from '../image-url';
import { marketingErrorMessage } from '../marketing-errors';
import { CampaignsService } from '../campaigns/campaigns.service';
import { parsePincodes } from '../pincodes';
import { instantToIstInput, istInputToInstant, instantOrOriginal } from '../ist-datetime';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import {
  PromosService,
  CreatePromoDto,
  UpdatePromoDto,
  PromoPlacement,
  PromoTargetKind,
  PromoFrequency,
  PromoAudienceDto,
  PromoItem,
  PromoPriceItem,
  PromoPreviewResult,
} from './promos.service';

export interface PromoFormState {
  placement: PromoPlacement;
  internal_name: string;
  eyebrow: string;
  headline: string;
  body: string;
  cta_label: string;
  secondary_label: string;
  style: string;
  image_url: string;
  target_kind: PromoTargetKind;
  target_id: string;
  coupon_id: string;
  price_item_ids: string[];
  audience_mode: 'all' | 'guests' | 'signed_in';
  pincodes: string;
  platform: 'all' | 'android' | 'ios';
  min_app_version: string;
  never_booked: 'any' | 'yes' | 'no';
  priority: number;
  starts_at: string;
  ends_at: string;
  frequency: PromoFrequency;
  frequency_days: number | null;
  max_impressions: number | null;
}

@Component({
  selector: 'app-promo-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent],
  templateUrl: './promo-editor.component.html',
})
export class PromoEditorComponent implements OnInit {
  private readonly campaignsService = inject(CampaignsService);
  readonly allowedImageHosts = signal<string[] | null>(null);
  readonly policyError = signal<string | null>(null);

  private readonly promosService = inject(PromosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  promoId: string | null = null;
  private originalPromo: PromoItem | null = null;
  readonly priceItems = signal<PromoPriceItem[]>([]);
  readonly priceItemsError = signal<string | null>(null);
  readonly savedPreview = signal<PromoPreviewResult | null>(null);
  readonly previewError = signal<string | null>(null);
  private savedAudienceQuery: import('./promos.service').PromoPreviewQuery | null = null;
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly targetKinds: PromoTargetKind[] = [
    'category',
    'tests',
    'item',
    'package',
    'coupon',
    'support',
    'bookings',
    'reports_list',
    'home',
    'none',
  ];

  readonly styles: string[] = ['Brand Gradient', 'Purple', 'Blush'];

  form: PromoFormState = {
    placement: 'home_carousel',
    internal_name: '',
    eyebrow: '',
    headline: '',
    body: '',
    cta_label: 'Book Now',
    secondary_label: '',
    style: 'Brand Gradient',
    image_url: '',
    target_kind: 'none',
    target_id: '',
    coupon_id: '',
    price_item_ids: [],
    audience_mode: 'all',
    pincodes: '',
    platform: 'all',
    min_app_version: '',
    never_booked: 'any',
    priority: 0,
    starts_at: '',
    ends_at: '',
    frequency: 'once_per_day',
    frequency_days: null,
    max_impressions: null,
  };

  ngOnInit(): void {
    this.loadImagePolicy();
    this.loadPriceItems();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.promoId = id;
      this.loadPromo(id);
    }
  }

  loadPromo(id: string): void {
    this.loading.set(true);
    this.promosService.getPromo(id).subscribe({
      next: (promo) => {
        this.originalPromo = promo;
        this.form = {
          placement: promo.placement,
          internal_name: promo.internal_name,
          eyebrow: promo.eyebrow ?? '',
          headline: promo.headline,
          body: promo.body,
          cta_label: promo.cta_label,
          secondary_label: promo.secondary_label ?? '',
          style: promo.style ?? 'Brand Gradient',
          image_url: promo.image_url ?? '',
          target_kind: promo.target_kind,
          target_id: promo.target_id ?? '',
          coupon_id: promo.coupon_id ?? '',
          price_item_ids: [...promo.price_item_ids],
          audience_mode: promo.audience?.audience_mode ?? 'all',
          pincodes: (promo.audience?.pincodes ?? []).join(', '),
          platform: (promo.audience?.platform as 'all' | 'android' | 'ios') ?? 'all',
          min_app_version: promo.audience?.min_app_version ?? '',
          never_booked:
            promo.audience?.never_booked === undefined
              ? 'any'
              : promo.audience.never_booked
                ? 'yes'
                : 'no',
          priority: promo.priority,
          starts_at: instantToIstInput(promo.starts_at),
          ends_at: instantToIstInput(promo.ends_at),
          frequency: promo.frequency,
          frequency_days: promo.frequency_days,
          max_impressions: promo.max_impressions,
        };
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load promotion.');
        this.loading.set(false);
      },
    });
  }

  loadImagePolicy(): void {
    this.policyError.set(null);
    this.campaignsService.getPolicy().subscribe({
      next: (policy) => this.allowedImageHosts.set(policy.allowed_image_hosts),
      error: (err) =>
        this.policyError.set(marketingErrorMessage(err, 'Unable to load image policy.')),
    });
  }

  isImageUrlValid(): boolean {
    return this.imageUrlError() === null;
  }

  imageUrlError(): string | null {
    if (!this.form.image_url.trim()) return null;
    const hosts = this.allowedImageHosts();
    if (hosts === null) return this.policyError() || 'Image policy is loading. Try again shortly.';
    return imageUrlProblem(this.form.image_url, hosts);
  }

  loadPriceItems(): void {
    this.priceItemsError.set(null);
    this.promosService.getPriceItems().subscribe({
      next: (items) => this.priceItems.set(items),
      error: (err) =>
        this.priceItemsError.set(marketingErrorMessage(err, 'Unable to load catalog prices.')),
    });
  }

  togglePriceItem(id: string, selected: boolean): void {
    this.form.price_item_ids = selected
      ? Array.from(new Set([...this.form.price_item_ids, id]))
      : this.form.price_item_ids.filter((item) => item !== id);
  }

  retrySavedPreview(): void {
    if (!this.savedAudienceQuery) return;
    this.previewError.set(null);
    this.saving.set(true);
    this.promosService.previewPromo(this.savedAudienceQuery).subscribe({
      next: (preview) => {
        this.savedPreview.set(preview);
        this.saving.set(false);
      },
      error: (err) => {
        this.previewError.set(
          marketingErrorMessage(err, 'Promotion saved, but preview is unavailable.'),
        );
        this.saving.set(false);
      },
    });
  }

  private previewSaved(promo: PromoItem): void {
    this.promoId = promo.id;
    this.originalPromo = promo;
    this.savedAudienceQuery = {
      id: promo.id,
      audience_mode: this.form.audience_mode,
      ...(parsePincodes(this.form.pincodes).pincodes[0]
        ? { pincode: parsePincodes(this.form.pincodes).pincodes[0] }
        : {}),
      ...(this.form.platform !== 'all' ? { platform: this.form.platform } : {}),
      ...(this.form.min_app_version.trim()
        ? { app_version: this.form.min_app_version.trim() }
        : {}),
    };
    this.retrySavedPreview();
  }

  requiresTargetId(): boolean {
    return ['category', 'item', 'package', 'coupon'].includes(this.form.target_kind);
  }

  savePromo(): void {
    if (this.saving()) return;
    this.savedPreview.set(null);
    if (
      (this.form.starts_at && !istInputToInstant(this.form.starts_at)) ||
      (this.form.ends_at && !istInputToInstant(this.form.ends_at))
    ) {
      this.errorMessage.set('Enter a valid IST date and time.');
      return;
    }
    this.errorMessage.set(null);

    if (!this.form.internal_name.trim()) {
      this.errorMessage.set('Internal reference name is required.');
      return;
    }
    if (!this.form.headline.trim()) {
      this.errorMessage.set('Headline is required.');
      return;
    }
    if (!this.form.body.trim()) {
      this.errorMessage.set('Body copy is required.');
      return;
    }
    if (!this.form.cta_label.trim()) {
      this.errorMessage.set('CTA label is required.');
      return;
    }
    if (!this.isImageUrlValid()) {
      this.errorMessage.set(this.imageUrlError());
      return;
    }
    if (this.requiresTargetId() && !this.form.target_id.trim()) {
      this.errorMessage.set(`Target ID is required for target kind "${this.form.target_kind}".`);
      return;
    }
    if (
      this.form.frequency === 'once_every_n_days' &&
      (!this.form.frequency_days || this.form.frequency_days < 1)
    ) {
      this.errorMessage.set('Frequency days must be at least 1 for "once every N days".');
      return;
    }
    if (this.form.starts_at && this.form.ends_at) {
      const s = Date.parse(this.dateValue(this.form.starts_at, this.originalPromo?.starts_at)!);
      const e = Date.parse(this.dateValue(this.form.ends_at, this.originalPromo?.ends_at)!);
      if (s >= e) {
        this.errorMessage.set('Start schedule must be strictly before End schedule.');
        return;
      }
    }

    const parsedPincodes = parsePincodes(this.form.pincodes);
    if (parsedPincodes.invalid.length > 0) {
      this.errorMessage.set(
        `Invalid pincodes: ${parsedPincodes.invalid.join(', ')}. Enter six digits, not starting with zero.`,
      );
      return;
    }
    const pincodesList = parsedPincodes.pincodes;

    const audience: PromoAudienceDto = {
      audience_mode: this.form.audience_mode,
      pincodes: pincodesList.length > 0 ? pincodesList : undefined,
      platform: this.form.platform !== 'all' ? this.form.platform : undefined,
      min_app_version: this.form.min_app_version.trim() || undefined,
      ...(this.form.never_booked === 'any'
        ? {}
        : { never_booked: this.form.never_booked === 'yes' }),
    };

    const payload: CreatePromoDto = {
      placement: this.form.placement,
      internal_name: this.form.internal_name.trim(),
      eyebrow: this.form.eyebrow.trim() || null,
      headline: this.form.headline.trim(),
      body: this.form.body.trim(),
      cta_label: this.form.cta_label.trim(),
      secondary_label: this.form.secondary_label.trim() || null,
      style: this.form.style.trim() || null,
      image_url: this.form.image_url.trim() || null,
      target_kind: this.form.target_kind,
      target_id: this.form.target_id.trim() || null,
      coupon_id: this.form.target_kind === 'coupon' ? this.form.target_id.trim() || null : null,
      price_item_ids: [...this.form.price_item_ids],
      audience,
      priority: Number(this.form.priority) || 0,
      starts_at: this.dateValue(this.form.starts_at, this.originalPromo?.starts_at),
      ends_at: this.dateValue(this.form.ends_at, this.originalPromo?.ends_at),
      frequency: this.form.frequency,
      frequency_days:
        this.form.frequency === 'once_every_n_days' ? Number(this.form.frequency_days) : null,
      max_impressions: this.form.max_impressions ? Number(this.form.max_impressions) : null,
    };

    this.saving.set(true);

    if (this.promoId) {
      const updatePayload: UpdatePromoDto = { ...payload };
      this.promosService.updatePromo(this.promoId, updatePayload).subscribe({
        next: (saved) => this.previewSaved(saved),
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(err?.message || 'Failed to update promotion.');
        },
      });
    } else {
      payload.active = false; // Starts inactive per plan
      this.promosService.createPromo(payload).subscribe({
        next: (saved) => this.previewSaved(saved),
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(err?.message || 'Failed to create promotion.');
        },
      });
    }
  }

  private dateValue(input: string, original: string | null | undefined): string | null {
    const value = instantOrOriginal(input, original);
    if (!value || value === original) return value;
    // Helpers validate/resolve the instant; edited wire values retain the explicit IST offset.
    return istInputToInstant(input) ? `${input}:00+05:30` : null;
  }

  cancel(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
