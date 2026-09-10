import { Workbook } from 'exceljs';
import { CandidateRow } from './admin-stats-api';
import { AdminTime } from './admin-time';
import { reportSheet, styleWorkbook } from './admin-excel-style';

/** A genuine spreadsheet: sortable dates, numeric scores/percentages, and literal user text. */
export function tableWorkbook(rows: CandidateRow[], filters: Record<string, string | number>, time = new AdminTime(), exportedAt = new Date()) {
  const book = new Workbook(); book.creator = 'CodeReport'; book.created = exportedAt;
  const stamp = `Time zone: ${time.zone} | Exported: ${time.format(exportedAt)} | Confidential admin data`;
  const sheet = reportSheet(book, stamp, 'Candidates', ['Candidate', 'Candidate ID', 'Email', 'Phone', 'Campaign', 'Challenges',
    'Submissions', 'Test cases passed', 'Test cases total', 'Pass rate', 'Total score', 'Average score', 'Total time', 'Last submission (local)', 'UTC offset', 'Region (IP-derived)', 'AI marker check'],
    [30, 16, 36, 22, 26, 16, 16, 18, 18, 16, 16, 18, 18, 25, 18, 26, 30],
    `${rows.length} candidates matching the applied filters. See Export Details for the exact filters. Elapsed time: hours:minutes:seconds.`);
  for (const item of rows) {
    const p = item.performance;
    const r = sheet.addRow([item.fullName || 'Unnamed candidate', item.id, item.email, item.phone, item.sourceCampaign || 'Not recorded',
      p.questionsAttempted, p.attemptCount, p.testcasesPassed, p.testcasesTotal, p.passPercentage === null ? null : p.passPercentage / 100,
      p.totalScore, p.averageScore, p.durationMs === null ? null : p.durationMs / 86400000,
      time.excelDate(p.lastSubmittedAt), time.parts(p.lastSubmittedAt)?.offset, item.region || 'Unknown',
      item.aiMarkerDetected === true ? 'AI-used' : item.aiMarkerDetected === false ? 'Marker not found' : 'Not checked']);
    r.getCell(10).numFmt = '0.00%'; r.getCell(11).numFmt = r.getCell(12).numFmt = '0.00';
    r.getCell(13).numFmt = '[h]:mm:ss'; r.getCell(14).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }
  const details = reportSheet(book, stamp, 'Export Details', ['Setting', 'Value', 'Notes'], [28, 65, 65],
    'Filters match the main candidate table. Candidate rows retain the table order and snapshot.');
  details.addRow(['Candidate count', rows.length]); details.addRow(['Time zone', time.zone]);
  details.addRow(['Exported (local)', time.excelDate(exportedAt), time.parts(exportedAt)?.offset]).getCell(2).numFmt = 'yyyy-mm-dd hh:mm:ss';
  for (const [key, label] of Object.entries({ search: 'Search', campaign: 'Campaign', region: 'Region', startDate: 'Start date', endDate: 'End date',
    minPercent: 'Minimum pass rate (%)', maxPercent: 'Maximum pass rate (%)', bucket: 'Chart group' })) {
    const value = filters[key];
    details.addRow([label, value !== undefined && String(value).trim() !== '' ? value : key === 'minPercent' ? 0 : key === 'maxPercent' ? 100 : 'All']);
  }
  if (filters['asOf']) details.addRow(['Data snapshot (local)', time.excelDate(String(filters['asOf'])), time.parts(String(filters['asOf']))?.offset]).getCell(2).numFmt = 'yyyy-mm-dd hh:mm:ss';
  details.addRow(['Privacy', 'Admin only', 'Contains candidate contact and performance data. Handle securely.']);
  details.addRow(['AI marker check', 'Submitted code within selected dates and snapshot', 'Exact hidden-marker match is a review signal, not proof of AI use. Absence does not rule out AI assistance.']);
  details.addRow(['Region basis', 'Latest submission IP within the selected dates and snapshot', 'Approximate US state, not verified residence. VPNs may affect location. Outside US / Unknown are separate groups.']);
  styleWorkbook(book);
  return book;
}
