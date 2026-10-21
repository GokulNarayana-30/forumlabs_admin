import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./campaigns-list.component').then((m) => m.CampaignsListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./campaign-editor.component').then((m) => m.CampaignEditorComponent),
  },
  {
    path: ':id/report',
    loadComponent: () =>
      import('./campaign-report.component').then((m) => m.CampaignReportComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./campaign-editor.component').then((m) => m.CampaignEditorComponent),
  },
];
