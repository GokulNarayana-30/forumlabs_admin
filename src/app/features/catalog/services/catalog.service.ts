import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface StaffCatalogItemListItemDto {
  id: string;
  kind: string;
  code: string | null;
  name: string;
  mrp_paise: number;
  offer_price_paise: number | null;
  active: boolean;
  eligible_gender: string;
  min_age_years: number | null;
  max_age_years: number | null;
  category_ids: string[];
  is_popular: boolean;
  parameter_count: number | null;
}

export interface StaffCatalogItemDetailDto extends StaffCatalogItemListItemDto {
  description: string | null;
  preparation: string[];
  aliases: string[];
  sample_type: string | null;
  fasting_required: boolean;
  report_tat_hours: number | null;
}

export interface StaffCatalogCategoryListItemDto {
  id: string;
  name: string;
  sort_order: number;
  show_on_home: boolean;
  item_count: number;
}

export interface UpdateCatalogItemDto {
  mrp_paise?: number;
  offer_price_paise?: number | null;
  category_ids?: string[];
  eligible_gender?: 'any' | 'male' | 'female';
  min_age_years?: number | null;
  max_age_years?: number | null;
  active?: boolean;
}

export interface CategoryReorderItemDto {
  id: string;
  sort_order: number;
  show_on_home: boolean;
}

export interface ReorderCategoriesPayload {
  categories: CategoryReorderItemDto[];
}

export interface ImportPreviewRowDto {
  row_number: number;
  sheet: string;
  name: string;
  action: string;
  warnings: string[];
  errors: string[];
}

export interface CatalogImportPreviewDto {
  kind: 'import_preview';
  import_id: string;
  file_sha256: string;
  expires_at: string;
  can_apply: boolean;
  summary: {
    total_rows: number;
    valid_rows: number;
    warning_rows: number;
    error_rows: number;
    new_items_count: number;
    price_change_count: number;
  };
  rows: ImportPreviewRowDto[];
}

export interface ImportFileUnreadableDto {
  kind: 'import_file_unreadable';
  reason: string;
  sheet?: string;
}

export type CatalogImportPreviewResultDto = CatalogImportPreviewDto | ImportFileUnreadableDto;

export interface ImportApplyOptionsDto {
  hide_missing_items?: boolean;
  unserve_missing_pincodes?: boolean;
}

export interface ImportApplyCountsDto {
  created: number;
  updated: number;
  unchanged: number;
  hidden: number;
  categories_created: number;
  service_areas_created: number;
  service_areas_updated: number;
  service_areas_unserved: number;
}

export type CatalogImportApplyResultDto =
  | {
      kind: 'import_applied';
      import_id: string;
      catalog_version: number;
      counts: ImportApplyCountsDto;
    }
  | { kind: 'import_already_applied'; import_id: string }
  | { kind: 'import_expired'; import_id: string }
  | { kind: 'import_has_errors'; import_id: string }
  | { kind: 'import_preview_stale'; import_id: string };

@Injectable({
  providedIn: 'root',
})
export class CatalogService {
  private readonly api = inject(ApiClient);

  async getItems(): Promise<StaffCatalogItemListItemDto[]> {
    return firstValueFrom(this.api.get<StaffCatalogItemListItemDto[]>('/staff/catalog/items'));
  }

  async getItem(id: string): Promise<StaffCatalogItemDetailDto> {
    return firstValueFrom(this.api.get<StaffCatalogItemDetailDto>(`/staff/catalog/items/${id}`));
  }

  async updateItem(id: string, patch: UpdateCatalogItemDto): Promise<StaffCatalogItemDetailDto> {
    return firstValueFrom(
      this.api.patch<StaffCatalogItemDetailDto>(`/staff/catalog/items/${id}`, patch, {
        idempotent: true,
      }),
    );
  }

  async getCategories(): Promise<StaffCatalogCategoryListItemDto[]> {
    return firstValueFrom(
      this.api.get<StaffCatalogCategoryListItemDto[]>('/staff/catalog/categories'),
    );
  }

  async reorderCategories(
    categories: CategoryReorderItemDto[],
  ): Promise<{ status: string; count: number }> {
    return firstValueFrom(
      this.api.put<{ status: string; count: number }>(
        '/staff/catalog/categories/reorder',
        { categories },
        { idempotent: true },
      ),
    );
  }

  async uploadImportFile(file: File): Promise<CatalogImportPreviewResultDto> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return firstValueFrom(
      this.api.post<CatalogImportPreviewResultDto>('/staff/catalog/imports', formData),
    );
  }

  async applyImport(
    importId: string,
    options: ImportApplyOptionsDto,
  ): Promise<CatalogImportApplyResultDto> {
    return firstValueFrom(
      this.api.post<CatalogImportApplyResultDto>(
        `/staff/catalog/imports/${importId}/apply`,
        options,
        { idempotent: true },
      ),
    );
  }
}
