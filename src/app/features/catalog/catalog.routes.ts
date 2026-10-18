import { Component } from '@angular/core';
import { Routes } from '@angular/router';

@Component({
  standalone: true,
  template: `
    <div class="p-4 bg-white rounded-xl border border-surface-200">
      <h2 class="text-lg font-bold text-surface-900 mb-2">Diagnostic Catalog</h2>
      <p class="text-sm text-surface-600">Test catalog management, prices, and categories.</p>
    </div>
  `,
})
export class CatalogPlaceholderComponent {}

export const routes: Routes = [
  {
    path: '',
    component: CatalogPlaceholderComponent,
  },
];
