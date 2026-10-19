import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CatalogService,
  StaffCatalogCategoryListItemDto,
  StaffCatalogItemListItemDto,
} from '../../services/catalog.service';
import { errorText } from '../../../../core/api/error-text';

@Component({
  selector: 'app-catalog-edit-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog-edit-dialog.component.html',
})
export class CatalogEditDialogComponent implements OnChanges {
  private readonly catalogService = inject(CatalogService);

  @Input() item: StaffCatalogItemListItemDto | null = null;
  @Input() categories: StaffCatalogCategoryListItemDto[] = [];
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<void>();

  readonly mrpRupees = signal<number>(0);
  readonly offerPriceRupees = signal<number | null>(null);
  readonly eligibleGender = signal<'any' | 'male' | 'female'>('any');
  readonly minAgeYears = signal<number | null>(null);
  readonly maxAgeYears = signal<number | null>(null);
  readonly selectedCategoryIds = signal<string[]>([]);
  readonly active = signal<boolean>(true);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.item) {
      this.initForm();
    }
  }

  initForm(): void {
    if (!this.item) return;
    this.errorMessage.set('');
    this.mrpRupees.set(this.item.mrp_paise / 100);
    this.offerPriceRupees.set(
      this.item.offer_price_paise !== null ? this.item.offer_price_paise / 100 : null,
    );
    this.eligibleGender.set((this.item.eligible_gender as 'any' | 'male' | 'female') || 'any');
    this.minAgeYears.set(this.item.min_age_years);
    this.maxAgeYears.set(this.item.max_age_years);
    this.selectedCategoryIds.set([...this.item.category_ids]);
    this.active.set(this.item.active);
  }

  toggleCategory(categoryId: string): void {
    const current = this.selectedCategoryIds();
    if (current.includes(categoryId)) {
      this.selectedCategoryIds.set(current.filter((id) => id !== categoryId));
    } else {
      this.selectedCategoryIds.set([...current, categoryId]);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.errorMessage.set('');
  }

  async onSubmit(): Promise<void> {
    if (!this.item) return;

    this.errorMessage.set('');

    const mrp = this.mrpRupees();
    const offer = this.offerPriceRupees();
    const minAge = this.minAgeYears();
    const maxAge = this.maxAgeYears();

    if (mrp <= 0) {
      this.errorMessage.set('MRP must be greater than 0.');
      return;
    }

    if (offer !== null && offer > mrp) {
      this.errorMessage.set('Offer price cannot exceed MRP.');
      return;
    }

    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      this.errorMessage.set('Minimum age cannot exceed maximum age.');
      return;
    }

    this.isSubmitting.set(true);

    try {
      await this.catalogService.updateItem(this.item.id, {
        mrp_paise: Math.round(mrp * 100),
        offer_price_paise: offer !== null ? Math.round(offer * 100) : null,
        eligible_gender: this.eligibleGender(),
        min_age_years: minAge,
        max_age_years: maxAge,
        category_ids: this.selectedCategoryIds(),
        active: this.active(),
      });

      this.saved.emit();
      this.close();
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to update item');
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
