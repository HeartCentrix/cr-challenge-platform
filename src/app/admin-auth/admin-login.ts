import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuth, safeAdminReturnUrl } from './admin-auth';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin-login.css',
  template: `
    <main class="signin-layout">
      <section class="intro" aria-labelledby="welcomeTitle">
        <a href="/" class="brand"><img src="/assets/codereport-dark.png" alt="CodeReport"></a>
        <div class="intro-content">
          <img class="illustration" src="/assets/tsp-signin-illustration.png" alt="" width="459" height="281">
          <h1 id="welcomeTitle">Great talent.<br>Clear insights.</h1>
          <p>Explore challenge performance and discover the people behind the code.</p>
        </div>
      </section>
      <section class="login-panel" aria-labelledby="loginTitle">
        <div class="content">
          <p class="eyebrow">CHALLENGE PORTAL · ADMIN</p>
          <h2 id="loginTitle">Sign In</h2>
          <p class="description">Sign in to explore candidate statistics, challenge performance, and submission details.</p>
          <form #loginForm (submit)="login($event, loginForm, password)" [attr.aria-busy]="busy()">
            <fieldset [disabled]="busy()">
              <legend class="sr-only">Admin credentials</legend>
              <label for="adminEmail">Email Address</label>
              <input id="adminEmail" name="email" type="email" required maxlength="255" autocomplete="username" placeholder="you@codereport.com">
              <label for="adminPassword">Password</label>
              <input #password id="adminPassword" type="password" required maxlength="72" autocomplete="current-password" placeholder="Enter your password">
              <div class="signin-actions"><a href="/" class="back">Back to challenge</a><button type="submit">{{ busy() ? 'Signing in…' : 'Sign in' }} <span aria-hidden="true">→</span></button></div>
            </fieldset>
          </form>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <p class="access-note">Authorized admins only <span>· {{ environmentName }}</span></p>
        </div>
      </section>
    </main>
  `,
})
export class AdminLogin {
  private readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly environmentName = environment.name;
  readonly busy = signal(false);
  readonly error = signal('');

  async login(event: Event, form: HTMLFormElement, password: HTMLInputElement) {
    event.preventDefault();
    if (this.busy() || !form.reportValidity()) return;
    const email = String(new FormData(form).get('email') || '');
    const value = password.value;
    password.value = '';
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(email, value);
      const fallback = this.route.snapshot.data['destination'] || '/reset-admin-aria';
      await this.router.navigateByUrl(safeAdminReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), fallback), { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 401
        ? 'Invalid email or password.' : 'Unable to sign in. Check the backend connection and try again.');
    } finally { this.busy.set(false); }
  }
}
