import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CatalogService,
  CreateCatalogItemPayload,
  StaffCatalogCategoryListItemDto,
  StaffCatalogItemListItemDto,
} from '../../services/catalog.service';
import { ApiClientError } from '../../../../core/api/api-client.service';
import { errorText } from '../../../../core/api/error-text';

/** Readable text for the server's field codes that staff can fix themselves. */
const FIELD_CODE_TEXT: Record<string, string> = {
  invalid_fasting: 'Use hours as a number or a range (10-12), or the word No.',
  invalid_report_time: 'Use whole hours, for example 24.',
  invalid_shape: 'This value is in the wrong format.',
};

@Component({
  selector: 'app-catalog-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './catalog-create.component.html',
})
export class CatalogCreateComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);

  readonly categories = signal<StaffCatalogCategoryListItemDto[]>([]);
  readonly activeTests = signal<StaffCatalogItemListItemDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly submitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Map<string, string>>(new Map());

  // Form signals
  readonly kind = signal<'test' | 'package'>('test');
  readonly code = signal<string>('');
  readonly name = signal<string>('');
  readonly selectedCategoryIds = signal<string[]>([]);
  readonly price = signal<string>('');
  readonly offerPrice = signal<string>('');
  readonly whoCanBook = signal<'Everyone' | 'Women' | 'Men'>('Everyone');
  readonly description = signal<string>('');
  readonly sampleType = signal<string>('');
  readonly fasting = signal<string>('');
  readonly reportTime = signal<string>('');
  readonly preparation = signal<string>('');
  readonly aliases = signal<string>('');
  readonly active = signal<boolean>(true);
  readonly popular = signal<boolean>(false);

  // Package inclusions
  readonly selectedTestCodes = signal<string[]>([]);
  readonly testSearchTerm = signal<string>('');

  async ngOnInit(): Promise<void> {
    try {
      this.loading.set(true);
      const [cats, items] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getItems(),
      ]);
      this.categories.set(cats);
      this.activeTests.set(
        items.filter((item) => item.kind === 'test' && item.active && item.code !== null),
      );
    } catch (err) {
      this.errorMessage.set(errorText(err, 'Failed to load catalog data.'));
    } finally {
      this.loading.set(false);
    }
  }

  toggleCategory(id: string): void {
    const current = this.selectedCategoryIds();
    if (current.includes(id)) {
      this.selectedCategoryIds.set(current.filter((c) => c !== id));
    } else {
      this.selectedCategoryIds.set([...current, id]);
    }
  }

  addTestInclusion(code: string): void {
    const current = this.selectedTestCodes();
    if (!current.includes(code)) {
      this.selectedTestCodes.set([...current, code]);
    }
  }

  removeTestInclusion(code: string): void {
    this.selectedTestCodes.set(this.selectedTestCodes().filter((c) => c !== code));
  }

  getTestName(code: string): string {
    const test = this.activeTests().find((t) => t.code === code);
    return test ? test.name : code;
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    this.fieldErrors.set(new Map());

    const trimmedCode = this.code().trim().toUpperCase();
    const trimmedName = this.name().trim();
    const trimmedPrice = this.price().trim();
    const categoryIds = this.selectedCategoryIds();

    const localErrors = new Map<string, string>();
    if (!trimmedCode) localErrors.set('code', 'Code is required');
    if (!trimmedName) localErrors.set('name', 'Name is required');
    if (categoryIds.length === 0)
      localErrors.set('category_ids', 'At least one category is required');
    if (!trimmedPrice) localErrors.set('price', 'Price is required');

    if (this.kind() === 'package' && this.selectedTestCodes().length === 0) {
      localErrors.set('tests_included', 'At least one test must be included in package');
    }

    if (localErrors.size > 0) {
      this.fieldErrors.set(localErrors);
      this.errorMessage.set('Please correct the validation errors below.');
      return;
    }

    const prepLines = this.preparation()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const aliasList = this.aliases()
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    const payload: CreateCatalogItemPayload = {
      kind: this.kind(),
      code: trimmedCode,
      name: trimmedName,
      category_ids: categoryIds,
      price: trimmedPrice,
      offer_price: this.offerPrice().trim() ? this.offerPrice().trim() : null,
      who_can_book: this.whoCanBook(),
      description: this.description().trim() ? this.description().trim() : null,
      sample_type: this.sampleType().trim() ? this.sampleType().trim() : null,
      fasting: this.fasting().trim() ? this.fasting().trim() : null,
      report_time: this.reportTime().trim() ? this.reportTime().trim() : null,
      preparation: prepLines,
      aliases: aliasList,
      active: this.active(),
      popular: this.popular(),
      ...(this.kind() === 'package' ? { tests_included: this.selectedTestCodes() } : {}),
    };

    try {
      this.submitting.set(true);
      const res = await this.catalogService.createItem(payload);
      if (res.kind === 'catalog_item_created') {
        await this.router.navigate(['/catalog']);
      } else if (res.kind === 'code_exists') {
        this.errorMessage.set(`Code "${res.code}" already exists in the catalog.`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.details) {
        const fields = err.details['fields'];
        if (Array.isArray(fields)) {
          const map = new Map<string, string>();
          for (const f of fields as { path: string; code: string; message?: string }[]) {
            map.set(f.path, f.message ?? FIELD_CODE_TEXT[f.code] ?? f.code);
          }
          this.fieldErrors.set(map);
        }
      }
      this.errorMessage.set(errorText(err, 'Failed to create catalog item'));
    } finally {
      this.submitting.set(false);
    }
  }
}
