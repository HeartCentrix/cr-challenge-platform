import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { AdminStatsApi, AttemptDetail, CandidateDetail, CandidatePage, CandidateRow } from './admin-stats-api';
import { candidateReportFilename, candidateTableFilename } from './admin-export-format';
import { AdminTime } from './admin-time';

/** Component scoped: navigation cancels private-data downloads and pending requests. */
@Injectable()
export class AdminExport {
  private readonly http = inject(HttpClient);
  private readonly api = inject(AdminStatsApi);
  private readonly zone = inject(NgZone);
  private readonly stopped = new Subject<void>();
  private generation = 0;
  readonly busy = signal(false);
  readonly progress = signal('');
  readonly error = signal('');
  constructor() { inject(DestroyRef).onDestroy(() => { this.cancel(); this.stopped.complete(); }); }

  cancel() {
    this.generation++; this.stopped.next(); this.busy.set(false); this.progress.set(''); this.error.set('');
  }
  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const { url, ...options } = this.api.request(path, params);
    return firstValueFrom(this.http.get<T>(url, options).pipe(takeUntil(this.stopped)));
  }
  private assertCurrent(generation: number) { if (generation !== this.generation) throw new Error('Export cancelled.'); }
  private async run(job: (generation: number) => Promise<void>) {
    if (this.busy()) return;
    const generation = ++this.generation;
    this.busy.set(true); this.error.set(''); this.progress.set('Preparing export…');
    try { await job(generation); }
    catch (error) {
      if (generation === this.generation) {
        this.api.handleError(error);
        this.error.set('Export could not be completed. No partial file was downloaded. Please try again.');
        this.progress.set('');
      }
    } finally { if (generation === this.generation) this.busy.set(false); }
  }
  async table(loaded: CandidateRow[], cursor: number | null, total: number, filters: Record<string, string | number>) {
    if (!loaded.length) return;
    const rows = [...loaded], params = { ...filters };
    await this.run(async generation => {
      const seen = new Set(rows.map(row => row.id));
      const cursors = new Set<number>();
      while (cursor !== null) {
        this.assertCurrent(generation);
        if (cursors.has(cursor)) throw new Error('Repeated cursor');
        cursors.add(cursor); this.progress.set('Preparing ' + rows.length + ' of ' + total + ' candidates…');
        const batch: CandidatePage = await this.get('/candidates', { ...params, afterId: cursor, size: 100 });
        this.assertCurrent(generation);
        for (const row of batch.items) if (!seen.has(row.id)) { rows.push(row); seen.add(row.id); }
        cursor = batch.items.length ? batch.nextCursor : null;
      }
      this.assertCurrent(generation);
      if (rows.length !== total) throw new Error('Candidate set changed');
      const time = new AdminTime(), exportedAt = new Date();
      const { tableWorkbook } = await import('./admin-table-workbook');
      this.assertCurrent(generation);
      const bytes = await tableWorkbook(rows, params, time, exportedAt).xlsx.writeBuffer();
      this.assertCurrent(generation);
      this.download(new Uint8Array(bytes).buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', candidateTableFilename(params, time.date(exportedAt)));
      this.progress.set('Exported ' + rows.length + ' candidates.');
    });
  }
  async candidate(candidate: CandidateDetail, selected: AttemptDetail | undefined, scope: { day: string; timeZone: string; asOf: string }) {
    if (!scope.day || !candidate.attempts.total) return;
    const filters = { ...scope }, time = new AdminTime(scope.timeZone);
    await this.run(async generation => {
      const summaries = new Map<number, CandidateDetail['attempts']['items'][number]>();
      const pageCount = Math.ceil(candidate.attempts.total / candidate.attempts.size);
      for (let page = 0; page < pageCount; page++) {
        this.assertCurrent(generation);
        const data = page === candidate.attempts.page ? candidate
          : await this.get<CandidateDetail>('/candidates/' + candidate.id, { ...filters, page, size: candidate.attempts.size });
        this.assertCurrent(generation);
        if (data.attempts.total !== candidate.attempts.total) throw new Error('History changed');
        data.attempts.items.forEach(item => summaries.set(item.id, item));
      }
      if ([...summaries.values()].some(s => time.date(s.submittedAt) !== filters.day)) throw new Error('Submission outside selected day');
      if (summaries.size !== candidate.attempts.total) throw new Error('Incomplete history');
      const attempts: AttemptDetail[] = [];
      for (const summary of summaries.values()) {
        this.assertCurrent(generation);
        this.progress.set('Preparing submission ' + (attempts.length + 1) + ' of ' + summaries.size + '…');
        const detail = selected?.summary.id === summary.id ? selected
          : await this.get<AttemptDetail>('/candidates/' + candidate.id + '/attempts/' + summary.id);
        this.assertCurrent(generation); attempts.push(detail);
      }
      this.progress.set('Formatting Excel workbook…');
      const { candidateWorkbook } = await import('./admin-candidate-workbook');
      this.assertCurrent(generation);
      const bytes = await candidateWorkbook(candidate, attempts, time, new Date(), filters.day).xlsx.writeBuffer();
      this.assertCurrent(generation);
      this.download(new Uint8Array(bytes).buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', candidateReportFilename(candidate, filters.day));
      this.progress.set('Exported ' + filters.day + ' report with ' + attempts.length + ' submissions.');
    });
  }
  download(content: string | ArrayBuffer, type: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); } finally {
      link.remove();
      this.zone.runOutsideAngular(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
    }
  }
}
