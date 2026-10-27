import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { PatientSearchComponent } from './pages/patient-search/patient-search.component';
import { DeletionQueueComponent } from './deletion-queue.component';

export const routes: Routes = [
  {
    path: '',
    component: PatientSearchComponent,
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
