import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./coupons-list.component').then((m) => m.CouponsListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./coupon-editor.component').then((m) => m.CouponEditorComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./coupon-editor.component').then((m) => m.CouponEditorComponent),
  },
];
