import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CatalogImportPreviewDto, CatalogService } from '../../services/catalog.service';

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB

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
    return !!prev && prev.can_apply && prev.summary.error_rows === 0;
  });

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
      const message = err instanceof Error ? err.message : 'Failed to upload template file';
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
      const message = err instanceof Error ? err.message : 'Failed to apply import';
      this.errorMessage.set(message);
    } finally {
      this.isApplying.set(false);
    }
  }
}
