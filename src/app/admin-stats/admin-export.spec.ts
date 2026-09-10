import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminAuth } from '../admin-auth/admin-auth';
import { AdminExport } from './admin-export';
import { candidateReportFilename, candidateTableFilename } from './admin-export-format';
import { candidateWorkbook } from './admin-candidate-workbook';
import { tableWorkbook } from './admin-table-workbook';
import { AdminTime } from './admin-time';
import { Workbook } from 'exceljs';
import { AttemptDetail, CandidateDetail, CandidateRow } from './admin-stats-api';

const performance = { attemptCount: 2, questionsAttempted: 1, testcasesPassed: 3, testcasesTotal: 10,
  passPercentage: 30, totalScore: 80, averageScore: 40, durationMs: 65000, lastSubmittedAt: '2026-09-01T12:00:00Z' };
const row: CandidateRow = { id: 2, fullName: 'Example, "Candidate"', email: 'example@example.invalid', phone: '+12025550196', sourceCampaign: 'linkedin', performance };
const attempt: AttemptDetail = { summary: { id: 10, questionId: 1, slug: 'test', title: 'Challenge', language: 'Java',
  submittedAt: '2026-09-01T12:00:00Z', durationMs: 65000, testcasesPassed: 3, testcasesTotal: 10, passPercentage: 30,
  score: 40, speedBonus: 0, judgeStatus: 'Accepted' }, sourceCode: '<script>alert(1)</script>', prompt: '<img src=x onerror=alert(1)>',
  difficulty: 5, timeLimitSeconds: 600, starterCode: 'starter', referenceSolution: 'solution', ipAddress: '127.0.0.1', userAgent: 'test',
  testcases: [{ id: 1, ordinal: 1, sample: false, stdin: 'input', expectedOutput: 'expected', passed: false, judgeStatus: 'Wrong answer', execTimeMs: 1, memoryKb: 10, stdout: 'saved output' }] };
const candidate: CandidateDetail = { ...row, sourceCampaign: 'linkedin', consented: false, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-09-01T12:00:00Z',
  attempts: { items: [attempt.summary], total: 2, page: 0, size: 1 } };

describe('Admin exports', () => {
  it('exports AI-used flags separately from absent markers and unavailable checks', () => {
    const statuses = [true, false, undefined];
    const expected = ['AI-used', 'Marker not found', 'Not checked'];
    const table = tableWorkbook(statuses.map((flag, i) => ({ ...row, id: i + 1, aiMarkerDetected: flag })), {});
    const report = candidateWorkbook(candidate, statuses.map((flag, i) => ({ ...attempt,
      summary: { ...attempt.summary, id: i + 1 }, aiMarkerDetected: flag })));
    expected.forEach((label, i) => {
      expect(table.getWorksheet('Candidates')!.getCell(i + 5, 17).text).toBe(label);
      expect(report.getWorksheet('Submissions')!.getCell(i + 5, 26).text).toBe(label);
    });
  });

  let exporter: AdminExport;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AdminExport, provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AdminAuth, useValue: { headers: { Authorization: 'Bearer test-admin' }, clear: () => {} } }] });
    exporter = TestBed.inject(AdminExport); http = TestBed.inject(HttpTestingController);
    spyOn(exporter, 'download');
  });
  afterEach(() => { exporter.cancel(); http.verify(); });

  it('exports completed and empty lists without any additional requests', async () => {
    await exporter.table([], null, 0, {});
    expect(exporter.download).not.toHaveBeenCalled();
    await exporter.table([row], null, 1, { campaign: 'linkedin' });
    http.expectNone(() => true);
    expect(exporter.download).toHaveBeenCalledWith(jasmine.any(ArrayBuffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jasmine.stringMatching(/\.xlsx$/));
  });

  it('uses every applied filter and the table snapshot while fetching remaining rows in order', async () => {
    const filters = { campaign: 'linkedin', search: 'Example', minPercent: 25, maxPercent: 75, bucket: 'quarter',
      startDate: '2026-01-01', endDate: '2026-09-01', timeZone: 'Asia/Kolkata', asOf: '2026-09-01T12:00:00Z' };
    const done = exporter.table([row], 2, 2, filters);
    const request = http.expectOne(r => r.url.endsWith('/candidates'));
    for (const [key, value] of Object.entries(filters)) expect(request.request.params.get(key)).toBe(String(value));
    expect(request.request.params.get('afterId')).toBe('2');
    expect(request.request.params.get('size')).toBe('100');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-admin');
    request.flush({ items: [{ ...row, id: 1 }], total: 2, nextCursor: null }); await done;
    expect(exporter.download).toHaveBeenCalledWith(jasmine.any(ArrayBuffer), jasmine.any(String), jasmine.any(String));
    expect(exporter.busy()).toBeFalse();
  });

  it('does not download partial results on failure and cancels pending requests', async () => {
    const failed = exporter.table([row], 2, 2, {});
    http.expectOne(r => r.url.endsWith('/candidates')).flush({}, { status: 500, statusText: 'Error' }); await failed;
    expect(exporter.error()).toContain('No partial file');
    expect(exporter.download).not.toHaveBeenCalled();
    const cancelled = exporter.table([row], 2, 2, {});
    const request = http.expectOne(r => r.url.endsWith('/candidates')); exporter.cancel(); await cancelled;
    expect(request.cancelled).toBeTrue(); expect(exporter.busy()).toBeFalse(); expect(exporter.download).not.toHaveBeenCalled();
  });

  it('loads all history pages and full attempt details while reusing the selected attempt', async () => {
    const done = exporter.candidate(candidate, attempt, { day: '2026-09-01', timeZone: 'Asia/Kolkata', asOf: '2026-09-02T00:00:00Z' });
    const history = http.expectOne(r => r.url.endsWith('/candidates/2'));
    expect(history.request.params.get('page')).toBe('1');
    expect(history.request.params.get('day')).toBe('2026-09-01');
    expect(history.request.params.get('timeZone')).toBe('Asia/Kolkata');
    expect(history.request.params.get('asOf')).toBe('2026-09-02T00:00:00Z');
    const older = { ...attempt, summary: { ...attempt.summary, id: 9 }, sourceCode: 'older saved code' };
    history.flush({ ...candidate, attempts: { items: [older.summary], total: 2, page: 1, size: 1 } });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne(r => r.url.endsWith('/attempts/9')).flush(older);
    await done;
    expect(exporter.download).toHaveBeenCalledWith(jasmine.any(ArrayBuffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'codereport-Example-Candidate-report_2026-09-01.xlsx');
    const buffer = (exporter.download as jasmine.Spy).calls.mostRecent().args[0];
    const workbook = new Workbook(); await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet('Code and Questions')!.getColumn(4).values).toContain('older saved code');
    expect(exporter.progress()).toContain('2 submissions');
  });

  it('exports styled, independently usable sheets with typed numbers/dates and complete literal text', async () => {
    const source = 'class Main {\n  String text = "Hello, world";\n}' + 'x'.repeat(30000) + '😀'.repeat(10000);
    const detailed = { ...attempt, sourceCode: source,
      testcases: [attempt.testcases[0], { ...attempt.testcases[0], id: 2, stdout: '=HYPERLINK("bad")' }] };
    const noCases = { ...attempt, summary: { ...attempt.summary, id: 9 }, testcases: [] };
    const book = candidateWorkbook(candidate, [detailed, noCases], new AdminTime('Asia/Kolkata'), new Date('2026-09-01T12:00:00Z'));
    const restored = new Workbook(); await restored.xlsx.load(await book.xlsx.writeBuffer());
    expect(restored.worksheets.map(s => s.name)).toEqual(['Candidate Overview', 'Submissions', 'Code and Questions', 'Test Results', 'Test Case Content', 'Editor Activity', 'Activity Timeline', 'Editor Checkpoints']);
    expect(restored.getWorksheet('Editor Activity')!.getCell('G5').value).toBe('Not recorded');
    const history = restored.getWorksheet('Submissions')!;
    expect(history.rowCount).toBe(6);
    expect(history.getCell('F5').value).toEqual(new Date('2026-09-01T17:30:00Z'));
    expect(history.getCell('G5').value).toBe('UTC+05:30');
    expect(book.getWorksheet('Submissions')!.getCell('H5').value as number).toBeCloseTo(65000 / 86400000, 10);
    // ExcelJS reads time-formatted numeric cells as dates anchored to Excel's epoch.
    expect((history.getCell('H5').value as Date).getTime() - Date.UTC(1899, 11, 30)).toBe(65000);
    expect(history.getCell('H5').numFmt).toBe('[h]:mm:ss');
    expect(history.getCell('K5').value).toBe(0.3);
    expect(history.getCell('L5').value).toBe(40);
    expect(history.getCell('S6').value).toBe(0);
    expect(history.views[0].state).toBe('frozen');
    expect(history.autoFilter).toBeTruthy();
    expect(history.getCell('A4').font.bold).toBeTrue();
    expect(history.getCell('A2').text).toContain('Asia/Kolkata');
    expect(history.getCell('A2').text).toContain('17:30:00 UTC+05:30');
    const chunks: string[] = [];
    restored.getWorksheet('Code and Questions')!.eachRow((r, i) => {
      if (i > 4 && r.getCell(1).value === 10 && r.getCell(2).value === 'Submitted code') chunks.push(r.getCell(4).text);
    });
    expect(chunks.join('')).toBe(source);
    expect(chunks.every(chunk => chunk.length <= 30000)).toBeTrue();
    const results = restored.getWorksheet('Test Results')!;
    expect(results.rowCount).toBe(6);
    expect(results.getCell('D5').value).toBe('Hidden');
    const content = restored.getWorksheet('Test Case Content')!;
    expect(content.getColumn(5).values).toContain('=HYPERLINK("bad")');
    content.eachRow((r, i) => { if (i > 4) expect(r.getCell(5).formula).toBeUndefined(); });
    expect(candidateWorkbook(candidate, []).getWorksheet('Submissions')!.rowCount).toBe(4);
  });

  it('exports per-attempt activity with local time-zone labels and numeric offsets', async () => {
    const counts = { copy: 1, cut: 0, paste: 2, drop: 0 };
    const detailed: AttemptDetail = { ...attempt, editorActivity: {
      version: 1, questionSlug: 'test', startedAt: '2026-09-01T11:59:00Z', elapsedMs: 60000,
      question: counts, answer: counts, keydownCount: 10, trustedKeydownCount: 9, syntheticEvents: 1,
      modelChangeCount: 8, unexplainedChangeCount: 1, observedPasteCount: 1,
      insertedCharacters: 100, deletedCharacters: 3, droppedEvents: 0,
      bulkChangeCount: 1, unexplainedBulkChangeCount: 1, largestInsertion: 100,
      events: [{ offsetMs: 1000, kind: 'bulk-unexplained', area: 'answer', trusted: null, inserted: 100, deleted: 3 }],
    } };
    detailed.checkpointHistory = { status: 'recorded', finalCodeMatches: false, reportingGaps: false,
      checkpoints: [{ sequence: 1, receivedAt: '2026-09-01T11:59:30Z', sourceCode: '=literal code' + 'x'.repeat(31000), activity: detailed.editorActivity! }] };
    const book = candidateWorkbook(candidate, [detailed], new AdminTime('Asia/Kolkata'), new Date('2026-09-01T12:00:00Z'), '2026-09-01');
    const restored = new Workbook(); await restored.xlsx.load(await book.xlsx.writeBuffer());
    const timeline = restored.getWorksheet('Activity Timeline')!;
    expect(timeline.getCell('A5').value).toBe(10);
    expect(timeline.getCell('B5').value).toEqual(new Date('2026-09-01T17:29:00Z'));
    expect(timeline.getCell('C5').value).toBe('UTC+05:30');
    expect(timeline.getCell('D5').value).toBe(1000);
    expect(timeline.getCell('H5').value).toBe(100);
    const checkpoints = restored.getWorksheet('Editor Checkpoints')!;
    expect(checkpoints.getCell('C5').value).toEqual(new Date('2026-09-01T17:29:30Z'));
    expect(checkpoints.getCell('D5').value).toBe('UTC+05:30');
    expect(checkpoints.getCell('H5').value).toBe(1);
    expect(checkpoints.getCell('J5').formula).toBeUndefined();
    expect(checkpoints.getCell('J5').text + checkpoints.getCell('J6').text).toBe(detailed.checkpointHistory.checkpoints[0].sourceCode);
    expect(restored.getWorksheet('Editor Activity')!.getCell('E5').value).toBe(2);
    expect(() => candidateWorkbook(candidate, [detailed], new AdminTime('Asia/Kolkata'), new Date(), '2026-09-02')).toThrow();
  });

  it('creates a formatted table workbook with literal text, typed values and exact filter metadata', async () => {
    const rows = [{ ...row, fullName: '=SUM(1,2)', sourceCampaign: 'é\n"campaign"', region: 'Texas', regionCode: 'TX' }];
    const filters = { campaign: 'é\n"campaign"', region: 'TX', search: 'Example', startDate: '2026-09-01', endDate: '2026-09-02', minPercent: 25, maxPercent: 75, bucket: 'quarter' };
    const book = tableWorkbook(rows, filters, new AdminTime('Asia/Kolkata'), new Date('2026-09-01T20:45:00Z'));
    const restored = new Workbook(); await restored.xlsx.load(await book.xlsx.writeBuffer());
    const sheet = restored.getWorksheet('Candidates')!;
    expect(sheet.getCell('A5').value).toBe('=SUM(1,2)'); expect(sheet.getCell('A5').formula).toBeUndefined();
    expect(sheet.getCell('D5').value).toBe(row.phone);
    expect(sheet.getCell('J5').value).toBe(0.3); expect(sheet.getCell('J5').numFmt).toBe('0.00%');
    expect(sheet.getCell('N5').value).toEqual(new Date('2026-09-01T17:30:00Z'));
    expect(sheet.getCell('O5').value).toBe('UTC+05:30');
    expect(sheet.getCell('P5').value).toBe('Texas');
    expect(restored.getWorksheet('Export Details')!.getColumn(2).values).toContain('TX');
    expect(sheet.getCell('A2').text).toContain('2026-09-02 02:15:00 UTC+05:30');
    expect(sheet.getCell('A2').text).toContain('Asia/Kolkata');
    expect(sheet.views[0].state).toBe('frozen'); expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.getCell('A4').font.bold).toBeTrue();
    expect(restored.getWorksheet('Export Details')!.getColumn(2).values).toContain(filters.campaign);
  });
  it('does not export empty days or history containing another local day', async () => {
    const scope = { day: '2026-09-02', timeZone: 'Asia/Kolkata', asOf: '2026-09-03T00:00:00Z' };
    await exporter.candidate({ ...candidate, attempts: { items: [], total: 0, page: 0, size: 10 } }, undefined, scope);
    await exporter.candidate({ ...candidate, attempts: { items: [attempt.summary], total: 1, page: 0, size: 10 } }, attempt, scope);
    http.expectNone(() => true); expect(exporter.download).not.toHaveBeenCalled();
    expect(exporter.error()).toContain('No partial file');
    expect(() => candidateWorkbook(candidate, [attempt], new AdminTime(scope.timeZone), new Date(), scope.day)).toThrow();
  });
  it('uses a safe candidate name in the detail filename, with an ID fallback', () => {
    expect(candidateReportFilename({ id: 2, fullName: 'Akshat Verma' })).toBe('codereport-Akshat-Verma-report.xlsx');
    expect(candidateReportFilename({ id: 2, fullName: ' ../Akshat: Verma? ' })).toBe('codereport-Akshat-Verma-report.xlsx');
    expect(candidateReportFilename({ id: 2, fullName: 'José García' })).toBe('codereport-José-García-report.xlsx');
    expect(candidateReportFilename({ id: 2, fullName: ' /:*? ' })).toBe('codereport-candidate-2-report.xlsx');
    expect(candidateReportFilename({ id: 2, fullName: '' })).toBe('codereport-candidate-2-report.xlsx');
    expect(candidateReportFilename({ id: 2, fullName: 'A'.repeat(300) }).length).toBeLessThan(130);
  });
  it('includes every active table filter in the filename and omits internal pagination/snapshot values', () => {
    const filename = candidateTableFilename({ search: 'Akshat Verma', campaign: 'linkedin', region: 'TX', startDate: '2026-09-01',
      endDate: '2026-09-09', minPercent: 25, maxPercent: 75, bucket: 'quarter', asOf: 'private-snapshot', afterId: 99 }, '2026-09-09');
    for (const part of ['search_Akshat-Verma', 'campaign_linkedin', 'from_2026-09-01', 'to_2026-09-09', 'pass-25-to-75', 'group-quarter']) {
      expect(filename).toContain(part);
    }
    expect(filename).not.toContain('snapshot');
    expect(filename).toContain('region_TX');
    expect(filename).not.toContain('afterId');
    expect(candidateTableFilename({ bucket: 'all', minPercent: 0, maxPercent: 100 }, '2026-09-09')).toBe('codereport-all-candidates_2026-09-09.xlsx');
    expect(candidateTableFilename({ search: '../a:b?' }, '2026-09-09')).toContain('search_a-b');
  });
});
