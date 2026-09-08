import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminAuth } from './admin-auth';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../reset-admin-aaron/reset-admin-aaron.css',
  template: `
    <main>
      <a href="/" class="back">Back to challenge</a>
      <section aria-labelledby="loginTitle">
        <p class="eyebrow">CODE REPORT · ADMIN · {{ environmentName }}</p>
        <h1 id="loginTitle">Admin login</h1>
        <p>Sign in to manage the daily submission limit.</p>
        <form #loginForm (submit)="login($event, loginForm, password)">
          <fieldset [disabled]="busy()">
            <legend>Admin credentials</legend>
            <label for="adminEmail">Email</label>
            <input id="adminEmail" name="email" type="email" required maxlength="255" autocomplete="username">
            <label for="adminPassword">Password</label>
            <input #password id="adminPassword" type="password" required maxlength="72" autocomplete="current-password">
            <button type="submit">{{ busy() ? 'Signing in...' : 'Sign in' }}</button>
          </fieldset>
        </form>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </section>
    </main>
  `,
})
export class AdminLogin {
  private readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);
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
      await this.router.navigateByUrl('/reset-admin-aaron', { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 401
        ? 'Invalid email or password.' : 'Unable to sign in. Check the backend connection and try again.');
    } finally { this.busy.set(false); }
  }
}
