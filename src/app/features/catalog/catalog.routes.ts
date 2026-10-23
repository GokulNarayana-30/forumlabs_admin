import { Routes } from '@angular/router';
import { CatalogListComponent } from './pages/catalog-list/catalog-list.component';
import { CategoryManagerComponent } from './pages/category-manager/category-manager.component';
import { CatalogImportComponent } from './pages/catalog-import/catalog-import.component';
import { CatalogCreateComponent } from './pages/catalog-create/catalog-create.component';
import { roleGuard } from '../../core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'new',
    component: CatalogCreateComponent,
    canActivate: [roleGuard],
    data: { roles: ['catalog_manager', 'super_admin'] },
  },
  {
    path: '',
    component: CatalogListComponent,
  },
  {
    path: 'categories',
    component: CategoryManagerComponent,
  },
  {
    path: 'import',
    component: CatalogImportComponent,
  },
];
