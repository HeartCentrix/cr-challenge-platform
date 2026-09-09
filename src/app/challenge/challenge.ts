import { AfterViewInit, ChangeDetectionStrategy, Component, NgZone, OnDestroy, inject } from '@angular/core';
import { ActivityEditor, EditorActivity } from './editor-activity';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    bootstrapChallenge: (factory: (portal: HTMLElement, editor: ActivityEditor, slug: string) => EditorActivity) => (() => void);
    buildChallengeMap: () => void;
  }
}

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      scripts.delete(src);
      script.remove();
      reject(new Error(`Could not load challenge script: ${src}`));
    };
    document.head.appendChild(script);
  });
  scripts.set(src, loading);
  return loading;
}

@Component({
  selector: 'app-challenge',
  templateUrl: './challenge.html',
  host: { style: 'display: contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Challenge implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private destroyed = false;
  private cleanup?: () => void;

  ngAfterViewInit() {
    this.zone.runOutsideAngular(async () => {
      try {
        await Promise.all([
          loadScript('/map.js'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'),
          loadScript('/app.js'),
        ]);
        if (this.destroyed) return;
        window.buildChallengeMap();
        this.cleanup = window.bootstrapChallenge((portal, editor, slug) => new EditorActivity(portal, editor, slug, `${environment.apiBaseUrl}/activity-checkpoints`));
      } catch {
        if (this.destroyed) return;
        const title = document.getElementById('problemTitle');
        if (title) title.textContent = 'Could not load the challenge. Please refresh to try again.';
      }
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.cleanup?.();
  }
}
