import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CatalogService, StaffCatalogCategoryListItemDto } from '../../services/catalog.service';

@Component({
  selector: 'app-category-manager',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './category-manager.component.html',
})
export class CategoryManagerComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);

  readonly categories = signal<StaffCatalogCategoryListItemDto[]>([]);
  readonly isDirty = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  ngOnInit(): void {
    void this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const data = await this.catalogService.getCategories();
      // Ensure sorted by sort_order
      const sorted = [...data].sort((a, b) => a.sort_order - b.sort_order);
      this.categories.set(sorted);
      this.isDirty.set(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load categories';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    const list = [...this.categories()];
    const temp = list[index];
    list[index] = list[index - 1];
    list[index - 1] = temp;

    // Reassign sequential 1-based sort orders
    const updated = list.map((item, idx) => ({
      ...item,
      sort_order: idx + 1,
    }));

    this.categories.set(updated);
    this.isDirty.set(true);
  }

  moveDown(index: number): void {
    const list = [...this.categories()];
    if (index >= list.length - 1) return;
    const temp = list[index];
    list[index] = list[index + 1];
    list[index + 1] = temp;

    // Reassign sequential 1-based sort orders
    const updated = list.map((item, idx) => ({
      ...item,
      sort_order: idx + 1,
    }));

    this.categories.set(updated);
    this.isDirty.set(true);
  }

  toggleHome(index: number): void {
    const list = [...this.categories()];
    if (index < 0 || index >= list.length) return;

    list[index] = {
      ...list[index],
      show_on_home: !list[index].show_on_home,
    };

    this.categories.set(list);
    this.isDirty.set(true);
  }

  async onSave(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const payload = this.categories().map((c) => ({
      id: c.id,
      sort_order: c.sort_order,
      show_on_home: c.show_on_home,
    }));

    try {
      await this.catalogService.reorderCategories(payload);
      this.isDirty.set(false);
      this.successMessage.set('Category order and visibility saved successfully.');
      await this.loadCategories();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save categories';
      this.errorMessage.set(message);
    } finally {
      this.isSaving.set(false);
    }
  }
}
