import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ADMIN_CACHE_TTL_MS, AdminDataCache, adminDataCacheInterceptor } from './admin-data-cache';
import { environment } from '../../environments/environment';

describe('AdminDataCache', () => {
  const url = environment.apiBaseUrl + '/admin/stats/candidates';
  const headers = { Authorization: 'Bearer cache-test' };
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([adminDataCacheInterceptor])), provideHttpClientTesting()],
  }));
  afterEach(() => { TestBed.inject(AdminDataCache).clear(); TestBed.inject(HttpTestingController).verify(); });

  it('deduplicates in-flight requests and caches empty responses, then expires automatically after one hour', fakeAsync(() => {
    const http = TestBed.inject(HttpClient), backend = TestBed.inject(HttpTestingController);
    let responses = 0;
    http.get(url, { headers }).subscribe(() => responses++);
    http.get(url, { headers }).subscribe(() => responses++);
    backend.expectOne(url).flush({ items: [], total: 0, nextCursor: null });
    expect(responses).toBe(2);
    tick(ADMIN_CACHE_TTL_MS - 1);
    http.get(url, { headers }).subscribe(() => responses++);
    backend.expectNone(url); expect(responses).toBe(3);
    tick(1);
    http.get(url, { headers }).subscribe();
    backend.expectOne(url).flush({ items: [], total: 0, nextCursor: null });
  }));

  it('separates filters and admin sessions, never caches errors, and clears data on logout', () => {
    const http = TestBed.inject(HttpClient), backend = TestBed.inject(HttpTestingController), cache = TestBed.inject(AdminDataCache);
    http.get(url, { headers, params: { campaign: 'direct' } }).subscribe();
    backend.expectOne(url + '?campaign=direct').flush({ items: [] });
    let hit = false;
    http.get(url, { headers, params: { campaign: 'direct' } }).subscribe(() => hit = true);
    expect(hit).toBeTrue();
    backend.expectNone(url + '?campaign=direct');
    http.get(url, { headers, params: { campaign: 'linkedin' } }).subscribe({ error: () => {} });
    backend.expectOne(url + '?campaign=linkedin').flush({}, { status: 503, statusText: 'Unavailable' });
    http.get(url, { headers, params: { campaign: 'linkedin' } }).subscribe();
    backend.expectOne(url + '?campaign=linkedin').flush({ items: [] });
    http.get(url, { headers: { Authorization: 'Bearer another-admin' }, params: { campaign: 'direct' } }).subscribe();
    backend.expectOne(url + '?campaign=direct').flush({ items: [] });
    cache.clear();
    http.get(url, { headers, params: { campaign: 'direct' } }).subscribe();
    backend.expectOne(url + '?campaign=direct').flush({ items: [] });
  });

  it('fetches history and attempt details again instead of caching stale results', () => {
    const http = TestBed.inject(HttpClient), backend = TestBed.inject(HttpTestingController);
    for (const path of ['/10/history', '/10/attempts/40']) {
      http.get(url + path, { headers }).subscribe();
      backend.expectOne(url + path).flush({ status: 'Queued' });
      let result: any;
      http.get(url + path, { headers }).subscribe(value => result = value);
      backend.expectOne(url + path).flush({ status: 'Accepted' });
      expect(result.status).toBe('Accepted');
    }
  });

  it('expires private responses earlier when the admin session expires', fakeAsync(() => {
    const cache = TestBed.inject(AdminDataCache), http = TestBed.inject(HttpClient), backend = TestBed.inject(HttpTestingController);
    cache.activate(new Date(Date.now() + 1000).toISOString());
    let count = 0;
    http.get(url, { headers }).subscribe(() => count++); backend.expectOne(url).flush({ items: [] });
    tick(1000);
    http.get(url, { headers }).subscribe(() => count++); backend.expectOne(url).flush({ items: [] });
    expect(count).toBe(2);
  }));
});
