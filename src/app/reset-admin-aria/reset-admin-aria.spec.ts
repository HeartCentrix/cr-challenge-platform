import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ResetAdminAria } from './reset-admin-aria';
import { environment } from '../../environments/environment';
import { signal } from '@angular/core';
import { AdminAuth } from '../admin-auth/admin-auth';
import { Router } from '@angular/router';

describe('ResetAdminAria', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [ResetAdminAria],
    providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AdminAuth, useValue: { headers: { Authorization: 'Bearer test-token' }, email: signal('admin@example.invalid'), clear: jasmine.createSpy('clear') } },
      { provide: Router, useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) } },
    ],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function setup(multiple = false) {
    const fixture = TestBed.createComponent(ResetAdminAria);
    if (multiple) fixture.componentInstance.mode.set('multiple');
    fixture.detectChanges();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    (form.elements.namedItem('emails') as HTMLInputElement).value = 'one@example.invalid';
    (form.elements.namedItem('confirmed') as HTMLInputElement).checked = true;
    return { fixture, form, http: TestBed.inject(HttpTestingController) };
  }

  it('requires confirmation and sends no request just from opening the page', () => {
    const { fixture, form, http } = setup();
    (form.elements.namedItem('confirmed') as HTMLInputElement).checked = false;
    fixture.componentInstance.reset(new Event('submit'), form);
    http.expectNone(`${environment.apiBaseUrl}/admin/daily-limit/reset`);
    expect(fixture.componentInstance.busy()).toBeFalse();
  });

  it('submits one email with its session token and no password fields', async () => {
    const { fixture, form, http } = setup();
    const pending = fixture.componentInstance.reset(new Event('submit'), form);
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/daily-limit/reset`);
    expect(request.request.body).toEqual({ emails: ['one@example.invalid'], confirmed: true });
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(form.querySelector('input[type=password]')).toBeNull();
    request.flush({ date: '2026-09-08', results: [{ email: 'one@example.invalid', status: 'RESET', locksRemoved: 2 }] });
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('can submit again');
    expect(fixture.componentInstance.busy()).toBeFalse();
  });

  it('parses and deduplicates multiple emails and blocks duplicate clicks', async () => {
    const { fixture, form, http } = setup(true);
    (form.elements.namedItem('emails') as HTMLTextAreaElement).value = 'one@example.invalid, two@example.invalid\none@example.invalid';
    const pending = fixture.componentInstance.reset(new Event('submit'), form);
    fixture.componentInstance.reset(new Event('submit'), form);
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/daily-limit/reset`);
    expect(request.request.body.emails).toEqual(['one@example.invalid', 'two@example.invalid']);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(TestBed.inject(AdminAuth).clear).toHaveBeenCalled();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/reset-admin-aria/login', { replaceUrl: true });
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.busy()).toBeFalse();
  });

  it('rejects more than 100 emails before contacting the API', () => {
    const { fixture, form, http } = setup(true);
    (form.elements.namedItem('emails') as HTMLTextAreaElement).value = Array.from({ length: 101 }, (_, i) => `test${i}@example.invalid`).join('\n');
    fixture.componentInstance.reset(new Event('submit'), form);
    http.expectNone(`${environment.apiBaseUrl}/admin/daily-limit/reset`);
    expect(fixture.componentInstance.error()).toContain('up to 100');
  });
});
