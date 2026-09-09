import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAuth } from './admin-auth';
import { environment } from '../../environments/environment';

describe('AdminAuth', () => {
  const key = `challenge-admin-session:${environment.apiBaseUrl}`;
  beforeEach(() => {
    sessionStorage.removeItem(key);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); sessionStorage.removeItem(key); });

  it('stores an expiring token, validates it, and revokes it on logout', async () => {
    const auth = TestBed.inject(AdminAuth);
    const http = TestBed.inject(HttpTestingController);
    const login = auth.login('admin@example.invalid', 'test-password');
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/auth/login`);
    expect(request.request.headers.get('Authorization')).toBe('Basic ' + btoa('admin@example.invalid:test-password'));
    request.flush({ token: 'opaque-token', email: 'admin@example.invalid', expiresAt: new Date(Date.now() + 1800000).toISOString() });
    await login;
    expect(sessionStorage.getItem(key)).not.toContain('test-password');
    const check = auth.checkSession();
    const validation = http.expectOne(`${environment.apiBaseUrl}/admin/auth/session`);
    expect(validation.request.headers.get('Authorization')).toBe('Bearer opaque-token');
    validation.flush({ email: 'admin@example.invalid' });
    expect(await check).toBeTrue();
    const logout = auth.logout();
    http.expectOne(`${environment.apiBaseUrl}/admin/auth/logout`).flush({ message: 'Signed out.' });
    await logout;
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(await auth.checkSession()).toBeFalse();
  });

  it('rejects a locally expired session without a network request', async () => {
    sessionStorage.setItem(key, JSON.stringify({ token: 'expired', email: 'admin@example.invalid', expiresAt: '2000-01-01T00:00:00Z' }));
    expect(await TestBed.inject(AdminAuth).checkSession()).toBeFalse();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
