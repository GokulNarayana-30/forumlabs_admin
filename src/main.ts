import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch(() => {
  const el = document.createElement('div');
  el.textContent = 'Application failed to initialize.';
  document.body.appendChild(el);
});
