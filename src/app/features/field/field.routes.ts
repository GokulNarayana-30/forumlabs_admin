import { Routes } from '@angular/router';
import { FieldTodayComponent } from './pages/field-today/field-today.component';
import { FieldSummaryComponent } from './field-summary.component';

export const routes: Routes = [
  {
    path: '',
    component: FieldTodayComponent,
  },
  {
    path: 'summary',
    component: FieldSummaryComponent,
  },
];
