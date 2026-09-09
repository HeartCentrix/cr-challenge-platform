import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

declare global {
  interface Window {
    __CHALLENGE_API_BASE__?: string;
    __CHALLENGE_CAPTURE_BADGE__?: (element: HTMLElement) => Promise<HTMLCanvasElement>;
  }
}

window.__CHALLENGE_API_BASE__ = environment.apiBaseUrl;
window.__CHALLENGE_CAPTURE_BADGE__ = (element) => import('html2canvas')
  .then(({ default: html2canvas }) => html2canvas(element, {
    backgroundColor: '#000000', scale: 2, logging: false
  }));

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
