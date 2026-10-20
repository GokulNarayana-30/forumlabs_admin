import { Routes } from '@angular/router';
import { TicketsListComponent } from './tickets-list.component';
import { TicketThreadComponent } from './ticket-thread.component';

export const routes: Routes = [
  {
    path: '',
    component: TicketsListComponent,
  },
  {
    path: ':ticket_id',
    component: TicketThreadComponent,
  },
];

export default routes;
