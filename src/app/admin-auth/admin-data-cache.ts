import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export const ADMIN_CACHE_TTL_MS = 60 * 60 * 1000;
interface Entry<T> { value: T; expiresAt: number; timer: ReturnType<typeof setTimeout>; bytes: number; }

/** Tab-memory only. Never persist candidate data, credentials, or responses to browser storage. */
@Injectable({ providedIn: 'root' })
export class AdminDataCache {
  private readonly zone = inject(NgZone);
  private readonly entries = new Map<string, Entry<HttpResponse<unknown>>>();
  private readonly snapshots = new Map<string, Entry<string>>();
  private readonly pending = new Map<string, Observable<HttpEvent<unknown>>>();
  private revision = 0;
  private bytes = 0;
  private sessionExpiresAt = Infinity;
  private sessionTimer?: ReturnType<typeof setTimeout>;
  constructor() { inject(DestroyRef).onDestroy(() => this.clear()); }

  activate(expiresAt: string) {
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionExpiresAt = Date.parse(expiresAt);
    const remaining = this.sessionExpiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { this.clear(); return; }
    this.sessionTimer = this.zone.runOutsideAngular(() => setTimeout(() => this.clear(), remaining));
  }
  snapshot(filters: Record<string, string>): string {
    const key = JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
    const existing = this.snapshots.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.value;
    if (existing) { clearTimeout(existing.timer); this.snapshots.delete(key); }
    const value = new Date().toISOString();
    const timer = this.zone.runOutsideAngular(() => setTimeout(() => this.snapshots.delete(key), ADMIN_CACHE_TTL_MS));
    if (this.snapshots.size >= 100) { const oldest = this.snapshots.keys().next().value!; clearTimeout(this.snapshots.get(oldest)!.timer); this.snapshots.delete(oldest); }
    this.snapshots.set(key, { value, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS, timer, bytes: 0 });
    return value;
  }
  response(key: string, fetch: () => Observable<HttpEvent<unknown>>): Observable<HttpEvent<unknown>> {
    if (Date.now() >= this.sessionExpiresAt) { this.clear(); return fetch(); }
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return of(cached.value.clone());
    if (cached) this.remove(key);
    const pending = this.pending.get(key); if (pending) return pending;
    const revision = this.revision;
    const request = fetch().pipe(
      tap(event => {
        if (!(event instanceof HttpResponse) || revision !== this.revision) return;
        // Avoid unbounded memory when browsing large saved source-code/result payloads.
        const bytes = JSON.stringify(event.body)?.length * 2 || 0;
        if (bytes > 10 * 1024 * 1024) return;
        while (this.entries.size >= 100 || (this.entries.size && this.bytes + bytes > 10 * 1024 * 1024)) this.remove(this.entries.keys().next().value!);
        const lifetime = Math.min(ADMIN_CACHE_TTL_MS, this.sessionExpiresAt - Date.now());
        if (lifetime <= 0) return;
        const timer = this.zone.runOutsideAngular(() => setTimeout(() => this.remove(key), lifetime));
        this.entries.set(key, { value: event.clone(), expiresAt: Date.now() + lifetime, timer, bytes }); this.bytes += bytes;
      }),
      finalize(() => { if (revision === this.revision) this.pending.delete(key); }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.pending.set(key, request); return request;
  }
  private remove(key: string) {
    const entry = this.entries.get(key); if (!entry) return;
    clearTimeout(entry.timer); this.bytes -= entry.bytes; this.entries.delete(key);
  }
  clear() {
    this.revision++;
    this.entries.forEach(entry => clearTimeout(entry.timer)); this.entries.clear(); this.bytes = 0;
    this.snapshots.forEach(entry => clearTimeout(entry.timer)); this.snapshots.clear(); this.pending.clear();
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
  }
}

export const adminDataCacheInterceptor: HttpInterceptorFn = (request, next) => {
  const root = environment.apiBaseUrl + '/admin/stats';
  if (request.method !== 'GET' || (request.url !== root && !request.url.startsWith(root + '/'))) return next(request);
  const authorization = request.headers.get('Authorization');
  if (!authorization || authorization === 'Bearer ') return next(request);
  return inject(AdminDataCache).response(authorization + '|' + request.urlWithParams, () => next(request));
};
