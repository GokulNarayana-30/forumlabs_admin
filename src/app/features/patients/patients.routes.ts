import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { PatientSearchComponent } from './pages/patient-search/patient-search.component';
import { DeletionQueueComponent } from './deletion-queue.component';
import { PatientDirectoryComponent } from './pages/patient-directory/patient-directory.component';

export const routes: Routes = [
  {
    path: '',
    component: PatientSearchComponent,
  },
  {
    // The full patient directory: super admin only (the API rechecks the current grant on every page).
    path: 'directory',
    component: PatientDirectoryComponent,
    canActivate: [roleGuard],
    data: { roles: ['super_admin'] },
  },
  {
    // Deletion queue and restore: support and super_admin (retention controls inside are
    // super_admin only). The API rechecks current grants on every call.
    path: 'deletions',
    component: DeletionQueueComponent,
    canActivate: [roleGuard],
    data: { roles: ['support', 'super_admin'] },
  },
];

export default routes;
