import { Routes } from '@angular/router';
import { CatalogListComponent } from './pages/catalog-list/catalog-list.component';
import { CategoryManagerComponent } from './pages/category-manager/category-manager.component';
import { CatalogImportComponent } from './pages/catalog-import/catalog-import.component';

export const routes: Routes = [
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
