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
import { errorText } from '../../../../core/api/error-text';

export interface CategoryGroup {
  category: { id: string; name: string; sort_order: number };
  items: StaffCatalogItemListItemDto[];
}

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
  readonly typeFilter = signal<'all' | 'test' | 'package'>('all');
  readonly groupByCategory = signal<boolean>(false);

  readonly isLoading = signal<boolean>(false);
  readonly isPending = signal<boolean>(false);
  readonly pendingItemIds = signal<Set<string>>(new Set());
  private loadGeneration = 0;

  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly editDialogVisible = signal<boolean>(false);
  readonly selectedItemForEdit = signal<StaffCatalogItemListItemDto | null>(null);

  private compareItems(a: StaffCatalogItemListItemDto, b: StaffCatalogItemListItemDto): number {
    // 1. type test first, then package
    const aKind = a.kind === 'test' ? 0 : 1;
    const bKind = b.kind === 'test' ? 0 : 1;
    if (aKind !== bKind) return aKind - bKind;

    // 2. primary category order / name
    const allCats = this.categories();
    const aCat = a.category_ids?.length ? allCats.find((c) => c.id === a.category_ids[0]) : null;
    const bCat = b.category_ids?.length ? allCats.find((c) => c.id === b.category_ids[0]) : null;

    if (aCat && bCat) {
      if (aCat.sort_order !== bCat.sort_order) return aCat.sort_order - bCat.sort_order;
      const catNameCmp = aCat.name.localeCompare(bCat.name);
      if (catNameCmp !== 0) return catNameCmp;
    } else if (aCat && !bCat) {
      return -1;
    } else if (!aCat && bCat) {
      return 1;
    }

    // 3. item name
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;

    // 4. id tie-break
    return a.id.localeCompare(b.id);
  }

  readonly filteredItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.selectedCategoryFilter();
    const type = this.typeFilter();
    let result = this.items();

    if (type !== 'all') {
      result = result.filter((item) => item.kind === type);
    }

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

    return [...result].sort((a, b) => this.compareItems(a, b));
  });

  readonly distinctFilteredCount = computed(() => this.filteredItems().length);

  readonly groupedCategories = computed<CategoryGroup[]>(() => {
    const filtered = this.filteredItems();
    const selectedCat = this.selectedCategoryFilter();
    const allCats = this.categories();

    const groups: CategoryGroup[] = [];

    const candidateCats = selectedCat
      ? allCats.filter((c) => c.id === selectedCat)
      : [...allCats].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    for (const cat of candidateCats) {
      const matchingItems = filtered
        .filter((item) => item.category_ids.includes(cat.id))
        .sort((a, b) => {
          const aKind = a.kind === 'test' ? 0 : 1;
          const bKind = b.kind === 'test' ? 0 : 1;
          if (aKind !== bKind) return aKind - bKind;
          const nameCmp = a.name.localeCompare(b.name);
          if (nameCmp !== 0) return nameCmp;
          return a.id.localeCompare(b.id);
        });

      if (matchingItems.length > 0) {
        groups.push({
          category: cat,
          items: matchingItems,
        });
      }
    }

    const knownCatIds = new Set(allCats.map((c) => c.id));
    const orphanItems = filtered.filter(
      (item) => !item.category_ids?.length || item.category_ids.every((id) => !knownCatIds.has(id)),
    );
    if (!selectedCat && orphanItems.length > 0) {
      groups.push({
        category: { id: 'uncategorized', name: 'Uncategorized', sort_order: 9999 },
        items: orphanItems.sort((a, b) => {
          const aKind = a.kind === 'test' ? 0 : 1;
          const bKind = b.kind === 'test' ? 0 : 1;
          if (aKind !== bKind) return aKind - bKind;
          return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        }),
      });
    }

    return groups;
  });

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(silent = false): Promise<void> {
    const currentGen = ++this.loadGeneration;
    if (!silent && this.items().length === 0) {
      this.isLoading.set(true);
    } else {
      this.isPending.set(true);
    }
    this.errorMessage.set('');

    try {
      const [items, categories] = await Promise.all([
        this.catalogService.getItems(),
        this.catalogService.getCategories(),
      ]);
      if (this.loadGeneration === currentGen) {
        this.items.set(items);
        this.categories.set(categories);
      }
    } catch (err: unknown) {
      if (this.loadGeneration === currentGen) {
        const message = errorText(err, 'Failed to load catalog');
        this.errorMessage.set(message);
      }
    } finally {
      if (this.loadGeneration === currentGen) {
        this.isLoading.set(false);
        this.isPending.set(false);
      }
    }
  }

  async toggleItemVisibility(item: StaffCatalogItemListItemDto): Promise<void> {
    const pending = this.pendingItemIds();
    if (pending.has(item.id)) return;

    const newPending = new Set(pending);
    newPending.add(item.id);
    this.pendingItemIds.set(newPending);
    this.errorMessage.set('');

    const priorActive = item.active;
    const nextActive = !priorActive;

    // Optimistically update
    this.items.update((list) =>
      list.map((it) => (it.id === item.id ? { ...it, active: nextActive } : it)),
    );

    try {
      const result = await this.catalogService.setVisibility(item.id, nextActive);
      if (result.kind === 'catalog_visibility_set') {
        this.successMessage.set(`Item "${item.name}" is now ${nextActive ? 'visible' : 'hidden'}.`);
        await this.loadData(true);
      }
    } catch (err: unknown) {
      // Rollback
      this.items.update((list) =>
        list.map((it) => (it.id === item.id ? { ...it, active: priorActive } : it)),
      );
      const message = errorText(err, 'Failed to update item visibility');
      this.errorMessage.set(message);
    } finally {
      const updatedPending = new Set(this.pendingItemIds());
      updatedPending.delete(item.id);
      this.pendingItemIds.set(updatedPending);
    }
  }

  openEditDialog(item: StaffCatalogItemListItemDto): void {
    this.selectedItemForEdit.set(item);
    this.editDialogVisible.set(true);
  }

  onItemSaved(): void {
    this.successMessage.set('Catalog item updated successfully.');
    void this.loadData(true);
  }

  getCategoryNames(categoryIds: string[]): string {
    if (!categoryIds || categoryIds.length === 0) return 'Uncategorized';
    const catMap = new Map(this.categories().map((c) => [c.id, c.name]));
    const names = categoryIds
      .map((id) => catMap.get(id))
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? names.join(', ') : 'Uncategorized';
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
