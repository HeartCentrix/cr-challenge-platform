import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminAuth } from '../admin-auth/admin-auth';
import { AdminTheme } from './admin-theme';

@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header><a class="brand" routerLink="/stats-admin"><img [src]="theme.mode() === 'dark' ? '/assets/codereport-white.png' : '/assets/codereport-dark.png'" alt="CodeReport"><small>CHALLENGE ADMIN</small></a>
      <nav aria-label="Admin navigation"><a routerLink="/stats-admin">Statistics</a>
        <a routerLink="/">Challenge portal</a><span>{{ auth.email() }}</span>
        <button type="button" (click)="theme.toggle()" [attr.aria-label]="theme.mode() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'">{{ theme.mode() === 'dark' ? '☀ Light' : '☾ Dark' }}</button>
        <button type="button" [disabled]="busy()" (click)="logout()">{{ busy() ? 'Signing out...' : 'Sign out' }}</button>
      </nav>
    </header>`,
  styles: `
    :host{display:block;flex-shrink:0}header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    a{color:var(--text);text-decoration:none;font-size:13px}a:hover{text-decoration:underline}.brand img{display:block;width:160px;height:31px;object-fit:contain}.brand small{display:block;font-size:9px;letter-spacing:.18em;margin-top:5px;color:var(--muted)}
    nav{display:flex;align-items:center;flex-wrap:wrap;gap:16px}nav span{font-size:11px;color:var(--muted);overflow-wrap:anywhere}button{font:inherit;font-size:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:8px 12px;border-radius:5px;cursor:pointer}
    a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    @media(max-width:700px){header{padding:10px 14px;gap:10px}nav{gap:10px}nav span{display:none}.brand img{width:125px;height:25px}}`,
})
export class AdminNav {
  readonly theme = inject(AdminTheme);
  readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  async logout() {
    if (this.busy()) return;
    this.busy.set(true);
    try { await this.auth.logout(); } catch { /* local credentials are always cleared */ }
    await this.router.navigateByUrl('/stats-admin/login', { replaceUrl: true });
    this.busy.set(false);
  }
}
