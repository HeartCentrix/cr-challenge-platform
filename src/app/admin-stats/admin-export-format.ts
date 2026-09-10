import { CandidateDetail } from './admin-stats-api';

import { AdminTime } from './admin-time';

function filenamePart(value: string, limit: number): string {
  return value.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '').slice(0, limit).replace(/-+$/g, '');
}
export function candidateReportFilename(candidate: Pick<CandidateDetail, 'id' | 'fullName'>, day?: string): string {
  const name = filenamePart(candidate.fullName || '', 100);
  return 'codereport-' + (name || 'candidate-' + candidate.id) + '-report' + (day ? '_' + filenamePart(day, 10) : '') + '.xlsx';
}
export function candidateTableFilename(filters: Record<string, string | number>, date = new AdminTime().date(new Date())): string {
  const parts: string[] = [];
  for (const key of ['search', 'campaign', 'region', 'startDate', 'endDate']) {
    const value = String(filters[key] ?? '').trim();
    if (value) parts.push(({ startDate: 'from', endDate: 'to' } as Record<string, string>)[key] || key,
      filenamePart(value, key.endsWith('Date') ? 10 : 35) || 'custom');
  }
  const min = Number(filters['minPercent'] ?? 0), max = Number(filters['maxPercent'] ?? 100);
  if (min !== 0 || max !== 100) parts.push('pass-' + min + '-to-' + max);
  const bucket = String(filters['bucket'] ?? 'all');
  if (bucket !== 'all') parts.push('group-' + filenamePart(bucket, 16));
  return 'codereport-' + (parts.length ? 'candidates_' + parts.join('_') : 'all-candidates') + '_' + date + '.xlsx';
}
