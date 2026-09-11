import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { signal } from '@angular/core';
import { AdminAuth } from '../admin-auth/admin-auth';
import { AdminCandidate } from './admin-candidate';

describe('AdminCandidate history', () => {
  const params = new BehaviorSubject(convertToParamMap({ id: '10' }));
  const summary = (id: number) => ({ id, questionId: 1, slug: 'fixture', title: 'Fixture question', language: 'Java',
    submittedAt: '2001-01-05T12:00:00Z', durationMs: 1000, testcasesPassed: 1, testcasesTotal: 2,
    passPercentage: 50, score: 50, speedBonus: 0, judgeStatus: 'Accepted' });
  const detail = (day: string | null, previousDay: string | null, nextDay: string | null, ids: number[], total = ids.length, page = 0) => ({
    id: 10, fullName: 'History fixture', email: 'history@example.invalid', phone: '', consented: false, sourceCampaign: 'direct',
    firstSeenAt: '2001-01-01T00:00:00Z', lastSeenAt: '2001-01-05T00:00:00Z',
    performance: { attemptCount: total, questionsAttempted: 1, testcasesPassed: total, testcasesTotal: total * 2,
      passPercentage: total ? 50 : null, totalScore: total * 50, averageScore: total ? 50 : 0, durationMs: 1000, lastSubmittedAt: null },
    attempts: { items: ids.map(summary), total, page, size: 10 },
    history: { day, previousDay, nextDay, asOf: '2026-09-11T00:00:00Z' },
  });
  beforeEach(() => {
    params.next(convertToParamMap({ id: '10' }));
    TestBed.configureTestingModule({ imports: [AdminCandidate], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value,
        queryParamMap: convertToParamMap({ startDate: '1999-01-01', endDate: '1999-01-01' }) } } },
      { provide: AdminAuth, useValue: { headers: { Authorization: 'Bearer test-token' }, email: signal('admin@example.invalid'), clear: jasmine.createSpy('clear') } },
    ] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function flushAttempt(fixture: ComponentFixture<AdminCandidate>, id: number) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/attempts/' + id)).flush({ summary: summary(id),
      sourceCode: 'class Main {}', prompt: 'Fixture', difficulty: 1, timeLimitSeconds: 60,
      starterCode: '', referenceSolution: '', ipAddress: '', userAgent: '', testcases: [] });
  }

  it('opens the latest recorded day without a calendar filter and exports the returned day', async () => {
    const fixture = TestBed.createComponent(AdminCandidate); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController), component = fixture.componentInstance;
    const request = http.expectOne(r => r.url.endsWith('/candidates/10/history'));
    expect(request.request.params.get('day')).toBe('');
    expect(request.request.params.has('startDate')).toBeFalse();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush(detail('2001-01-05', '2001-01-01', null, [40]));
    fixture.detectChanges(); await flushAttempt(fixture, 40); await fixture.whenStable(); fixture.detectChanges();
    expect(component.day()).toBe('2001-01-05');
    expect(fixture.nativeElement.querySelector('app-date-range')).toBeNull();
    const next = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Next attempt day')) as HTMLButtonElement;
    expect(next.disabled).toBeTrue();
    const exportSpy = spyOn(component.exporter, 'candidate').and.resolveTo();
    component.exportReport();
    expect(exportSpy.calls.mostRecent().args[2]).toEqual({ day: '2001-01-05', timeZone: component.time.zone, asOf: '2026-09-11T00:00:00Z' });
    fixture.destroy();
  });

  it('pages within a day, resets the page for earlier days and resets history for another candidate', async () => {
    const fixture = TestBed.createComponent(AdminCandidate); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController), component = fixture.componentInstance;
    const initial = http.expectOne(r => r.url.endsWith('/history'));
    const snapshot = initial.request.params.get('asOf');
    initial.flush(detail('2001-01-05', '2001-01-01', null, [40], 11));
    fixture.detectChanges(); await flushAttempt(fixture, 40); await fixture.whenStable();
    component.page.set(1); fixture.detectChanges();
    const page = http.expectOne(r => r.url.endsWith('/history'));
    expect(page.request.params.get('page')).toBe('1'); expect(page.request.params.get('asOf')).toBe(snapshot);
    page.flush(detail('2001-01-05', '2001-01-01', null, [39], 11, 1));
    fixture.detectChanges(); await flushAttempt(fixture, 39); await fixture.whenStable();
    component.setDay('2001-01-01'); fixture.detectChanges();
    const previous = http.expectOne(r => r.url.endsWith('/history'));
    expect(previous.request.params.get('day')).toBe('2001-01-01'); expect(previous.request.params.get('page')).toBe('0');
    previous.flush(detail('2001-01-01', null, '2001-01-05', [20]));
    fixture.detectChanges(); await flushAttempt(fixture, 20); await fixture.whenStable();
    component.setDay('2001-01-05'); fixture.detectChanges();
    const next = http.expectOne(r => r.url.endsWith('/history'));
    expect(next.request.params.get('day')).toBe('2001-01-05');
    params.next(convertToParamMap({ id: '11' })); fixture.detectChanges();
    expect(next.cancelled).toBeTrue();
    const other = http.expectOne(r => r.url.endsWith('/candidates/11/history'));
    expect(other.request.params.get('day')).toBe(''); expect(other.request.params.get('page')).toBe('0');
    other.flush(detail(null, null, null, [])); await fixture.whenStable();
    fixture.destroy();
  });

  it('shows a true empty history and refreshes to discover a first submission', async () => {
    const fixture = TestBed.createComponent(AdminCandidate); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController), component = fixture.componentInstance;
    http.expectOne(r => r.url.endsWith('/history')).flush(detail(null, null, null, []));
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No submissions recorded for this candidate.');
    http.expectNone(r => r.url.includes('/attempts/'));
    component.refresh(); fixture.detectChanges();
    const refreshed = http.expectOne(r => r.url.endsWith('/history'));
    expect(refreshed.request.params.get('day')).toBe('');
    refreshed.flush(detail('2001-01-05', null, null, [40]));
    fixture.detectChanges(); await flushAttempt(fixture, 40); await fixture.whenStable(); fixture.detectChanges();
    expect(component.selectedAttempt()).toBe(40);
    expect(fixture.nativeElement.textContent).not.toContain('No submissions recorded for this candidate.');
    fixture.destroy();
  });
});
