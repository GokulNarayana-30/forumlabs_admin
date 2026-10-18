import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CatalogService,
  StaffCatalogCategoryListItemDto,
  StaffCatalogItemListItemDto,
} from '../../services/catalog.service';
import { CatalogEditDialogComponent } from '../../components/catalog-edit-dialog/catalog-edit-dialog.component';

@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CatalogEditDialogComponent],
  templateUrl: './catalog-list.component.html',
})
export class CatalogListComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);

  readonly items = signal<StaffCatalogItemListItemDto[]>([]);
  readonly categories = signal<StaffCatalogCategoryListItemDto[]>([]);
  readonly searchTerm = signal<string>('');
  readonly selectedCategoryFilter = signal<string>('');

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly editDialogVisible = signal<boolean>(false);
  readonly selectedItemForEdit = signal<StaffCatalogItemListItemDto | null>(null);

  readonly filteredItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.selectedCategoryFilter();
    let result = this.items();

    if (cat) {
      result = result.filter((item) => item.category_ids.includes(cat));
    }

    if (term) {
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          (item.code && item.code.toLowerCase().includes(term)),
      );
    }

    return result;
  });

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [items, categories] = await Promise.all([
        this.catalogService.getItems(),
        this.catalogService.getCategories(),
      ]);
      this.items.set(items);
      this.categories.set(categories);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load catalog';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  openEditDialog(item: StaffCatalogItemListItemDto): void {
    this.selectedItemForEdit.set(item);
    this.editDialogVisible.set(true);
  }

  onItemSaved(): void {
    this.successMessage.set('Catalog item updated successfully.');
    void this.loadData();
  }

  getCategoryNames(categoryIds: string[]): string {
    if (!categoryIds || categoryIds.length === 0) return 'Uncategorized';
    const catMap = new Map(this.categories().map((c) => [c.id, c.name]));
    return categoryIds.map((id) => catMap.get(id) || id).join(', ');
  }

  formatEligibility(gender: string, minAge: number | null, maxAge: number | null): string {
    const parts: string[] = [];
    if (gender && gender !== 'any') {
      parts.push(gender.toUpperCase());
    }
    if (minAge !== null && maxAge !== null) {
      parts.push(`${minAge}-${maxAge} yrs`);
    } else if (minAge !== null) {
      parts.push(`>${minAge} yrs`);
    } else if (maxAge !== null) {
      parts.push(`<${maxAge} yrs`);
    }
    return parts.length > 0 ? parts.join(', ') : 'All Patients';
  }
}
