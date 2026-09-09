import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminAuth } from '../admin-auth/admin-auth';
import { environment } from '../../environments/environment';
import type { EditorActivityReport } from '../challenge/editor-activity';

export interface Bucket { key: string; label: string; count: number; candidatePercentage: number; }
export interface Overview { totalCandidates: number; totalAttempts: number; basis: string; averageCandidateScore: number; buckets: Bucket[]; }
export interface Performance { attemptCount: number; questionsAttempted: number; testcasesPassed: number; testcasesTotal: number; passPercentage: number | null; totalScore: number; averageScore: number; durationMs: number | null; lastSubmittedAt: string; }
export interface CandidatePage { items: CandidateRow[]; total: number; nextCursor: number | null; }
export interface Page<T> { items: T[]; total: number; page: number; size: number; }
export interface AttemptSummary {
  id: number; questionId: number; slug: string; title: string; language: string; submittedAt: string;
  durationMs: number | null; testcasesPassed: number; testcasesTotal: number; passPercentage: number | null;
  score: number; speedBonus: number; judgeStatus: string | null;
}
export interface CandidateRow { id: number; fullName: string; email: string; phone: string; sourceCampaign: string | null; performance: Performance; }
export interface CandidateDetail {
  id: number; fullName: string; email: string; phone: string; consented: boolean; sourceCampaign: string;
  firstSeenAt: string; lastSeenAt: string; performance: Performance; attempts: Page<AttemptSummary>;
}
export interface CaseResult {
  id: number; ordinal: number; sample: boolean; stdin: string | null; expectedOutput: string | null;
  passed: boolean | null; judgeStatus: string | null; execTimeMs: number | null; memoryKb: number | null; stdout: string | null;
}
export interface AttemptDetail {
  checkpointHistory?: { status: string; finalCodeMatches: boolean | null; reportingGaps: boolean;
    checkpoints: { sequence: number; receivedAt: string; sourceCode: string; activity: EditorActivityReport }[] };
  editorActivity?: EditorActivityReport | null;
  summary: AttemptSummary; sourceCode: string; prompt: string; difficulty: number; timeLimitSeconds: number;
  starterCode: string; referenceSolution: string; ipAddress: string; userAgent: string; testcases: CaseResult[];
}

export function duration(ms: number | null): string {
  if (ms === null) return 'Not recorded';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class AdminStatsApi {
  private readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);

  request(path = '', params: Record<string, string | number> = {}) {
    return { url: `${environment.apiBaseUrl}/admin/stats${path}`, headers: this.auth.headers, params };
  }

  handleError(error: unknown) {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      const returnUrl = this.router.url;
      this.auth.clear();
      void this.router.navigate(['/stats-admin/login'], { queryParams: { returnUrl }, replaceUrl: true });
    }
  }

  message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Your session has expired. Please sign in again.';
      if (error.status === 404) return 'This candidate or attempt could not be found.';
      if (error.status === 400) return 'Invalid filter or page. Clear the filters and try again.';
    }
    return 'Could not load candidate data. Please try again.';
  }
}
