import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminDataCache } from './admin-data-cache';

interface Session { token: string; email: string; expiresAt: string; }

@Injectable({ providedIn: 'root' })
export class AdminAuth {
  private readonly cache = inject(AdminDataCache);
  private readonly http = inject(HttpClient);
  private readonly storageKey = `challenge-admin-session:${environment.apiBaseUrl}`;
  private session: Session | null = this.readSession();
  readonly email = signal(this.session?.email || '');
  constructor() { if (this.session) this.cache.activate(this.session.expiresAt); }

  private readSession(): Session | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(this.storageKey) || 'null');
      return value && typeof value.token === 'string' && typeof value.email === 'string'
        && Date.parse(value.expiresAt) > Date.now() ? value : null;
    } catch { return null; }
  }

  get headers(): { Authorization: string } {
    return { Authorization: `Bearer ${this.session?.token || ''}` };
  }

  async login(email: string, password: string): Promise<void> {
    this.clear();
    const credentials = btoa(Array.from(new TextEncoder().encode(`${email.trim()}:${password}`),
      byte => String.fromCharCode(byte)).join(''));
    this.session = await firstValueFrom(this.http.post<Session>(`${environment.apiBaseUrl}/admin/auth/login`, {},
      { headers: { Authorization: `Basic ${credentials}` } }));
    this.email.set(this.session.email);
    this.cache.activate(this.session.expiresAt);
    // Only an expiring opaque token is kept for this tab; never store the password.
    try { sessionStorage.setItem(this.storageKey, JSON.stringify(this.session)); } catch { /* memory-only fallback */ }
  }

  async checkSession(): Promise<boolean> {
    if (!this.session || Date.parse(this.session.expiresAt) <= Date.now()) { this.clear(); return false; }
    try {
      const result = await firstValueFrom(this.http.post<{email: string}>(
        `${environment.apiBaseUrl}/admin/auth/session`, {}, { headers: this.headers }));
      this.email.set(result.email);
      return true;
    } catch { this.clear(); return false; }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/admin/auth/logout`, {}, { headers: this.headers }));
    } finally { this.clear(); }
  }

  clear() {
    this.cache.clear();
    this.session = null;
    this.email.set('');
    try { sessionStorage.removeItem(this.storageKey); } catch { /* storage may be disabled */ }
  }
}

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AdminAuth);
  const router = inject(Router);
  const login = state.url.startsWith('/stats-admin') ? '/stats-admin/login' : '/reset-admin-aria/login';
  return await auth.checkSession() || router.createUrlTree([login], { queryParams: { returnUrl: state.url } });
};

export function safeAdminReturnUrl(value: string | null, fallback: string): string {
  return value && /^\/(?:stats-admin(?:\/candidates\/[1-9]\d*)?|reset-admin-aria)(?:\?[^#]*)?$/.test(value)
    ? value : fallback;
}
