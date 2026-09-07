import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

declare global {
  interface Window {
    __CHALLENGE_API_BASE__?: string;
  }
}

window.__CHALLENGE_API_BASE__ = environment.apiBaseUrl;

bootstrapApplication(App, appConfig)
  .then(() => window.dispatchEvent(new Event('challenge-config-ready')))
  .catch((err) => console.error(err));
