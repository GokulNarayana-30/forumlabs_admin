import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { TicketsListComponent } from './tickets-list.component';
import { TicketThreadComponent } from './ticket-thread.component';
import { DeskToolsComponent } from './desk-tools.component';

export const routes: Routes = [
  {
    path: '',
    component: TicketsListComponent,
  },
  {
    // Intake, canned replies, SLA policy and CSAT: support desk staff only (report approvers
    // work the urgent queue). The API enforces the same roles on every call.
    path: 'tools',
    component: DeskToolsComponent,
    canActivate: [roleGuard],
    data: { roles: ['support', 'super_admin'] },
  },
  {
    path: ':ticket_id',
    component: TicketThreadComponent,
  },
];

export default routes;
