import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import {
  CatalogImportPreviewDto,
  CatalogService,
  ImportChangeDto,
  ImportMessageDto,
  ImportPreviewRowDto,
  ImportSheetDto,
} from '../../services/catalog.service';
import { errorText } from '../../../../core/api/error-text';

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB

/** Plain wording for the closed CatalogImportMessageCode list (the server sends codes only). */
export const IMPORT_MESSAGE_TEXT: Readonly<Record<string, string>> = {
  required: 'is required',
  invalid_code: 'is not a valid code',
  duplicate_in_file: 'appears more than once in the file',
  code_used_by_test: 'is already used by a test',
  kind_mismatch: 'belongs to an item of the other kind',
  invalid_price: 'is not a valid price',
  offer_not_below_price: 'must be below the price',
  price_change_over_30_percent: 'changes the price by more than 30%',
  unknown_sample_type: 'is not a known sample type',
  invalid_fasting: 'is not a valid fasting value',
  invalid_report_time: 'is not a valid report time',
  invalid_who_can_book: 'is not a valid "who can book" value',
  invalid_yes_no: 'must be Yes or No',
  claims_wording: 'uses claims wording that is not allowed',
  too_long: 'is too long',
  unknown_test_code: 'names a test code that does not exist',
  new_category: 'creates a new category',
  category_looks_like: 'looks like an existing category',
  invalid_pincode: 'is not a valid pincode',
  invalid_fee: 'is not a valid fee',
};

const SHEET_LABELS: Readonly<Record<ImportSheetDto, string>> = {
  tests: 'Tests',
  packages: 'Packages',
  service_areas: 'Service areas',
};

@Component({
  selector: 'app-catalog-import',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './catalog-import.component.html',
})
export class CatalogImportComponent {
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);

  readonly selectedFile = signal<File | null>(null);
  readonly preview = signal<CatalogImportPreviewDto | null>(null);
  readonly unreadableError = signal<string>('');

  readonly hideMissingItems = signal<boolean>(false);
  readonly unserveMissingPincodes = signal<boolean>(false);

  readonly isUploading = signal<boolean>(false);
  readonly isApplying = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly canApply = computed(() => {
    const prev = this.preview();
    return !!prev && prev.can_apply && prev.counts.error === 0;
  });

  /** Rows in the file, derived from the API's counts (new + changed + unchanged + error). */
  readonly totalRows = computed(() => {
    const c = this.preview()?.counts;
    return c ? c.new + c.changed + c.unchanged + c.error : 0;
  });

  sheetLabel(sheet: ImportSheetDto): string {
    return SHEET_LABELS[sheet] ?? sheet;
  }

  messageText(message: ImportMessageDto): string {
    const text = IMPORT_MESSAGE_TEXT[message.code] ?? message.code;
    return message.field ? `${message.field} ${text}` : text;
  }

  rowErrors(row: ImportPreviewRowDto): ImportMessageDto[] {
    return row.messages.filter((m) => m.level === 'error');
  }

  rowWarnings(row: ImportPreviewRowDto): ImportMessageDto[] {
    return row.messages.filter((m) => m.level === 'warning');
  }

  changeText(change: ImportChangeDto): string {
    const show = (v: unknown): string =>
      v === null || v === undefined ? '(empty)' : typeof v === 'string' ? v : JSON.stringify(v);
    return `${change.field}: ${show(change.from)} -> ${show(change.to)}`;
  }

  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.onFileSelected(input.files[0]);
    }
  }

  async onFileSelected(file: File): Promise<void> {
    this.errorMessage.set('');
    this.successMessage.set('');
    this.unreadableError.set('');
    this.preview.set(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.errorMessage.set(
        `Selected file exceeds the 2 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a valid Excel file.`,
      );
      this.selectedFile.set(null);
      return;
    }

    this.selectedFile.set(file);
    this.isUploading.set(true);

    try {
      const result = await this.catalogService.uploadImportFile(file);

      if (result.kind === 'import_preview') {
        this.preview.set(result);
      } else if (result.kind === 'import_file_unreadable') {
        const detail = result.sheet ? ` in sheet "${result.sheet}"` : '';
        this.unreadableError.set(`${result.reason}${detail}`);
      }
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to upload template file');
      this.errorMessage.set(message);
    } finally {
      this.isUploading.set(false);
    }
  }

  async onApply(): Promise<void> {
    const prev = this.preview();
    if (!prev || !this.canApply()) return;

    this.isApplying.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const result = await this.catalogService.applyImport(prev.import_id, {
        hide_missing_items: this.hideMissingItems(),
        unserve_missing_pincodes: this.unserveMissingPincodes(),
      });

      switch (result.kind) {
        case 'import_applied':
          this.successMessage.set(
            `Import applied successfully! Catalog version ${result.catalog_version}. Created: ${result.counts.created}, Updated: ${result.counts.updated}, Unchanged: ${result.counts.unchanged}, Hidden: ${result.counts.hidden}`,
          );
          this.preview.set(null);
          this.selectedFile.set(null);
          break;

        case 'import_has_errors':
          this.errorMessage.set('Cannot apply import containing validation errors.');
          break;

        case 'import_preview_stale':
          this.errorMessage.set(
            'Catalog has changed since this preview was generated. Please upload again.',
          );
          break;

        case 'import_expired':
          this.errorMessage.set('Import preview has expired. Please upload again.');
          break;

        case 'import_already_applied':
          this.errorMessage.set('This import has already been applied.');
          break;
      }
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to apply import');
      this.errorMessage.set(message);
    } finally {
      this.isApplying.set(false);
    }
  }
}
