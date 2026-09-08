import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminAuth } from '../admin-auth/admin-auth';
import { Router } from '@angular/router';

interface ResetResult {
  date: string;
  results: { email: string; status: 'RESET' | 'NO_LIMIT' | 'NOT_FOUND'; locksRemoved: number }[];
}

@Component({
  selector: 'app-reset-admin-aaron',
  templateUrl: './reset-admin-aaron.html',
  styleUrl: './reset-admin-aaron.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetAdminAaron {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);
  readonly mode = signal<'one' | 'multiple'>('one');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<ResetResult | null>(null);
  readonly environmentName = environment.name;

  setMode(mode: 'one' | 'multiple', confirmation: HTMLInputElement) {
    this.mode.set(mode);
    confirmation.checked = false;
    this.result.set(null);
    this.error.set('');
  }

  async logout() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.logout();
    } catch { /* local session is cleared even if the server is unreachable */ }
    await this.router.navigateByUrl('/reset-admin-aaron/login', { replaceUrl: true });
    this.busy.set(false);
  }

  async reset(event: Event, form: HTMLFormElement) {
    event.preventDefault();
    if (this.busy() || !form.reportValidity()) return;
    const data = new FormData(form);
    const emails = [...new Set(String(data.get('emails') || '').split(/[\s,;]+/).filter(Boolean))];
    this.error.set('');
    this.result.set(null);
    if (!emails.length || emails.length > 100 || (this.mode() === 'one' && emails.length !== 1)
        || emails.some(email => email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      this.error.set('Enter valid email addresses: one in single mode, or up to 100 in multiple mode.');
      return;
    }
    this.busy.set(true);
    try {
      this.result.set(await firstValueFrom(this.http.post<ResetResult>(
        `${environment.apiBaseUrl}/admin/daily-limit/reset`,
        { emails, confirmed: data.get('confirmed') === 'on' },
        { headers: this.auth.headers },
      )));
      (form.elements.namedItem('confirmed') as HTMLInputElement).checked = false;
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      if (status === 401) {
        this.auth.clear();
        await this.router.navigateByUrl('/reset-admin-aaron/login', { replaceUrl: true });
        return;
      }
      this.error.set(status === 401 ? 'Invalid admin email or password. Please try again.'
        : status === 503 ? 'Admin access is unavailable. Check the backend admin database setup.'
        : status === 409 ? 'A submission is still processing. No reset was applied; try again shortly.'
        : status === 400 ? 'Check the email addresses and confirmation, then try again.'
        : 'Could not confirm the reset. Check the backend connection before trying again.');
    } finally {
      this.busy.set(false);
    }
  }
}
