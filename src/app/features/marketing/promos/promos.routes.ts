import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./promos-list.component').then((m) => m.PromosListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./promo-editor.component').then((m) => m.PromoEditorComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./promo-editor.component').then((m) => m.PromoEditorComponent),
  },
];
