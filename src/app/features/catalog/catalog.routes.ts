import { Component } from '@angular/core';
import { Routes } from '@angular/router';
import { CatalogListComponent } from './pages/catalog-list/catalog-list.component';

@Component({
  standalone: true,
  template: `
    <div class="p-4 bg-white rounded-xl border border-surface-200">
      <h2 class="text-lg font-bold text-surface-900 mb-2">Category Manager</h2>
      <p class="text-sm text-surface-600">Reorder categories and configure home visibility.</p>
    </div>
  `,
})
export class CategoriesPlaceholderComponent {}

@Component({
  standalone: true,
  template: `
    <div class="p-4 bg-white rounded-xl border border-surface-200">
      <h2 class="text-lg font-bold text-surface-900 mb-2">Catalog Excel Import</h2>
      <p class="text-sm text-surface-600">Upload Excel template and preview updates.</p>
    </div>
  `,
})
export class ImportPlaceholderComponent {}

export const routes: Routes = [
  {
    path: '',
    component: CatalogListComponent,
  },
  {
    path: 'categories',
    component: CategoriesPlaceholderComponent,
  },
  {
    path: 'import',
    component: ImportPlaceholderComponent,
  },
];
