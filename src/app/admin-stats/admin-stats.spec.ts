import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { signal } from '@angular/core';
import { AdminAuth, safeAdminReturnUrl } from '../admin-auth/admin-auth';
import { AdminStats } from './admin-stats';
import { DateRangePicker } from './date-range';
import { StatsChart } from './stats-chart';

describe('AdminStats', () => {
  const params = new BehaviorSubject(convertToParamMap({}));
  beforeEach(() => {
    params.next(convertToParamMap({}));
    TestBed.configureTestingModule({ imports: [AdminStats], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
      { provide: AdminAuth, useValue: { headers: { Authorization: 'Bearer test-token' }, email: signal('admin@example.invalid'), clear: jasmine.createSpy('clear') } },
    ] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  const overviewData = { totalCandidates: 0, totalAttempts: 0, averageCandidateScore: 0, basis: 'overall', buckets: [{ key: 'zero', label: '0%', count: 0, candidatePercentage: 0 }] };

  it('loads authenticated totals and one batch, and shares date, campaign and percentage filters', async () => {
    const fixture = TestBed.createComponent(AdminStats); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const overview = http.expectOne(r => r.url.endsWith('/admin/stats'));
    expect(overview.request.headers.get('Authorization')).toBe('Bearer test-token');
    const snapshot = overview.request.params.get('asOf');
    overview.flush(overviewData);
    const list = http.expectOne(r => r.url.endsWith('/admin/stats/candidates'));
    expect(list.request.params.get('size')).toBe('25');
    expect(list.request.params.get('asOf')).toBe(snapshot);
    expect(list.request.headers.get('Authorization')).toBe('Bearer test-token');
    list.flush({ items: [], total: 0, nextCursor: null });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No candidates match');
    expect(fixture.nativeElement.querySelector('#totalCandidates').textContent).toBe('0');
    fixture.componentInstance.loadMore(); fixture.componentInstance.fillViewport();
    http.expectNone(r => r.url.endsWith('/candidates'));
    params.next(convertToParamMap({ campaign: 'linkedin', startDate: '2026-01-01', endDate: '2026-01-31', minPercent: '25', maxPercent: '75' }));
    fixture.detectChanges();
    const requests = http.match(r => r.url.includes('/admin/stats'));
    expect(requests.length).toBe(2);
    for (const request of requests) {
      expect(request.request.params.get('campaign')).toBe('linkedin');
      expect(request.request.params.get('startDate')).toBe('2026-01-01');
      expect(request.request.params.get('endDate')).toBe('2026-01-31');
      expect(request.request.params.get('minPercent')).toBe('25');
      expect(request.request.params.get('maxPercent')).toBe('75');
      request.flush(request.request.url.endsWith('/candidates') ? { items: [], total: 0, nextCursor: null } : overviewData);
    }
    fixture.destroy();
  });

  it('cancels stale lists, uses cursor batches and resets on bucket changes without refreshing the chart', () => {
    const fixture = TestBed.createComponent(AdminStats); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/admin/stats')).flush(overviewData);
    const stale = http.expectOne(r => r.url.endsWith('/candidates'));
    params.next(convertToParamMap({ bucket: 'perfect' })); fixture.detectChanges();
    expect(stale.cancelled).toBeTrue();
    const first = http.expectOne(r => r.url.endsWith('/candidates'));
    expect(first.request.params.get('bucket')).toBe('perfect');
    const row = { id: 100, fullName: 'Test Candidate', email: 'test@example.invalid', phone: '', sourceCampaign: 'direct',
      performance: { attemptCount: 2, questionsAttempted: 1, testcasesPassed: 20, testcasesTotal: 20, passPercentage: 100, totalScore: 160, averageScore: 80, durationMs: 5000, lastSubmittedAt: '2026-01-01T00:00:00Z' } };
    first.flush({ items: [row], total: 2, nextCursor: 100 });
    fixture.componentInstance.loadMore();
    const second = http.expectOne(r => r.url.endsWith('/candidates'));
    expect(second.request.params.get('afterId')).toBe('100');
    second.flush({ items: [{ ...row, id: 99 }], total: 2, nextCursor: null });
    expect(fixture.componentInstance.rows().map(r => r.id)).toEqual([100, 99]);
    fixture.componentInstance.loadMore();
    http.expectNone(r => r.url.endsWith('/candidates'));
    fixture.destroy();
  });

  it('allows only known local admin login destinations', () => {
    expect(safeAdminReturnUrl('/stats-admin/candidates/2', '/stats-admin')).toBe('/stats-admin/candidates/2');
    for (const value of ['https://evil.example', '//evil.example', '/stats-admin/login', '/stats-admin/../other', '/']) {
      expect(safeAdminReturnUrl(value, '/stats-admin')).toBe('/stats-admin');
    }
  });
});

describe('Custom calendar and charts', () => {
  it('selects just one report day without allowing a range or an all-dates reset', () => {
    const fixture = TestBed.createComponent(DateRangePicker);
    fixture.componentRef.setInput('singleDay', true); fixture.detectChanges();
    const picker = fixture.componentInstance;
    picker.pick('2026-09-01'); picker.pick('2026-09-02');
    expect(picker.start()).toBe('2026-09-02'); expect(picker.end()).toBe('2026-09-02');
    expect(picker.inRange('2026-09-01')).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Clear dates');
    fixture.destroy();
  });
  it('supports selecting a reversed range and a single day in one calendar', () => {
    const fixture = TestBed.createComponent(DateRangePicker);
    const picker = fixture.componentInstance;
    picker.pick('2026-01-20'); picker.pick('2026-01-05');
    expect(picker.start()).toBe('2026-01-05'); expect(picker.end()).toBe('2026-01-20');
    expect(picker.inRange('2026-01-15')).toBeTrue();
    expect(picker.inRange('2026-01-21')).toBeFalse();
    picker.pick('2026-02-01'); picker.pick('2026-02-01');
    expect(picker.start()).toBe(picker.end());
    fixture.destroy();
  });
  it('renders a complete pie when one bucket contains every candidate and handles empty data', () => {
    const fixture = TestBed.createComponent(StatsChart);
    fixture.componentRef.setInput('buckets', [{ key: 'zero', label: '0%', count: 4, candidatePercentage: 100 }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.total()).toBe(4);
    expect(fixture.componentInstance.slices()[0].path).toContain('160 230');
    fixture.componentRef.setInput('buckets', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
    fixture.destroy();
  });
});
