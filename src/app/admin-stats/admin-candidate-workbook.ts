import { Workbook, Worksheet, CellValue } from 'exceljs';
import { AttemptDetail, CandidateDetail } from './admin-stats-api';
import { reportSheet, styleWorkbook } from './admin-excel-style';
import { AdminTime } from './admin-time';

const dateFormat = 'yyyy-mm-dd hh:mm:ss';
const elapsed = (ms: number | null) => ms === null ? null : ms / 86400000;
const percent = (value: number | null) => value === null ? null : value / 100;

/** Loaded only when an admin requests a detailed Excel export. Never interprets user text as formulas. */
export function candidateWorkbook(candidate: CandidateDetail, attempts: AttemptDetail[], time = new AdminTime(), exportedAt = new Date(), day?: string) {
  if (day && attempts.some(a => time.date(a.summary.submittedAt) !== day)) throw new Error('Submission outside report day');
  const book = new Workbook();
  book.creator = 'CodeReport'; book.created = exportedAt; book.modified = exportedAt;
  book.title = 'Candidate challenge report'; book.subject = 'Confidential admin report';
  const stamp = `Time zone: ${time.zone} | Exported: ${time.format(exportedAt)} | Confidential admin data`;
  const overview = reportSheet(book, stamp, 'Candidate Overview', ['Field', 'Value', 'Notes / UTC offset'], [30, 65, 70],
    'Results cover the report scope below. Totals are not repeated in test-case rows.');
  const submissions = reportSheet(book, stamp, 'Submissions', ['Attempt ID', 'Challenge', 'Question ID', 'Slug', 'Language', 'Submitted (local)',
    'UTC offset', 'Time taken', 'Passed', 'Total test cases', 'Pass rate', 'Score', 'Speed bonus', 'Judge status', 'Difficulty', 'Time limit (s)', 'IP address', 'User agent', 'Saved case records'],
    [14, 35, 14, 28, 15, 24, 15, 16, 12, 16, 14, 12, 14, 24, 12, 16, 20, 45, 20],
    'One row per submission. Speed bonus is included in score. Time taken is an elapsed duration, not a timestamp.');
  const code = reportSheet(book, stamp, 'Code and Questions', ['Attempt ID', 'Content', 'Part', 'Text'], [14, 24, 10, 110],
    'Source, problem, starter code and reference solution. Long text is split into numbered parts without truncation.');
  const results = reportSheet(book, stamp, 'Test Results', ['Attempt ID', 'Test case ID', 'Ordinal', 'Visibility', 'Result', 'Judge status', 'Runtime (ms)', 'Memory (KB)'],
    [14, 16, 12, 14, 20, 26, 18, 18], 'One row per saved test case. Match Attempt ID and Test case ID to Test Case Content.');
  const content = reportSheet(book, stamp, 'Test Case Content', ['Attempt ID', 'Test case ID', 'Content', 'Part', 'Text'], [14, 16, 22, 10, 110],
    'Complete input, expected output and candidate output. Join numbered parts in order, without adding separators.');

  const activitySummary = reportSheet(book, stamp, 'Editor Activity', ['Attempt ID', 'Area / metric', 'Copy', 'Cut', 'Paste', 'Drop', 'Value'],
    [14, 40, 12, 12, 12, 12, 60], 'Unverified client observations, not proof of cheating. Missing telemetry is not zero.');
  const activityEvents = reportSheet(book, stamp, 'Activity Timeline', ['Attempt ID', 'Tracking started (local)', 'UTC offset', 'Offset (ms)', 'Area', 'Event', 'Browser-trusted', 'Inserted characters', 'Deleted characters'],
    [14, 26, 15, 18, 15, 30, 20, 20, 20], 'Client clock start plus monotonic offset. No literal keys or clipboard contents; up to 5,000 events per attempt.');
  const checkpoints = reportSheet(book, stamp, 'Editor Checkpoints', ['Attempt ID', 'Sequence', 'Received (local)', 'UTC offset', 'Elapsed (ms)', 'Key events', 'Mass inputs', 'Flagged mass inputs', 'Code part', 'Code'],
    [14, 14, 26, 15, 18, 16, 16, 20, 12, 110], 'Server receipt times; client-reported code/activity. Changed states only, not proof of cheating. Code split into numbered parts.');
  const p = candidate.performance;
  const profile: CellValue[][] = [
    ['Candidate', candidate.fullName || 'Unnamed candidate'], ['Candidate ID', candidate.id], ['Email', candidate.email],
    ['Phone', candidate.phone], ['Campaign', candidate.sourceCampaign || 'Not recorded'], ['Marketing consent', candidate.consented ? 'Yes' : 'No'],
    ['Time zone', time.zone, 'All workbook timestamps use this local time zone. UTC offsets are recorded per timestamp.'],
    ['Exported', time.excelDate(exportedAt), time.parts(exportedAt)?.offset],
    ['First seen', time.excelDate(candidate.firstSeenAt), time.parts(candidate.firstSeenAt)?.offset],
    ['Last seen', time.excelDate(candidate.lastSeenAt), time.parts(candidate.lastSeenAt)?.offset],
    ['Last submission', time.excelDate(p.lastSubmittedAt), time.parts(p.lastSubmittedAt)?.offset],
    ['Submissions', p.attemptCount], ['Challenges attempted', p.questionsAttempted], ['Test cases passed', p.testcasesPassed],
    ['Total test cases', p.testcasesTotal], ['Pass rate', percent(p.passPercentage)], ['Total score', p.totalScore],
    ['Average submission score', p.averageScore], ['Total time taken', elapsed(p.durationMs), 'Elapsed time, hours:minutes:seconds'],
    ['Report scope', day ? 'Selected day: ' + day : 'All saved submissions', attempts.length + ' full submission records exported'],
    ['Question content', 'Current question bank', 'Problem statements, inputs and expected outputs are not historical snapshots. Source code, scores and results are saved per submission.'],
    ['Privacy', 'Admin only', 'Contains contact information, submitted code, hidden test cases and reference solutions. Handle securely.'],
    ['Missing values', 'Blank cells mean not recorded', 'A recorded zero remains numeric zero. No submissions means empty history sheets.'],
  ];
  profile.forEach(values => {
    const r = overview.addRow(values);
    if (values[1] instanceof Date) r.getCell(2).numFmt = dateFormat;
    if (values[0] === 'Overall pass rate') r.getCell(2).numFmt = '0.00%';
    if (values[0] === 'Total time taken') r.getCell(2).numFmt = '[h]:mm:ss';
  });
  function textRows(s: Worksheet, ids: CellValue[], kind: CellValue, text: string | null | undefined) {
    // Excel cells are limited to 32,767 UTF-16 code units. Avoid splitting surrogate pairs.
    const value = text ?? '(not recorded)'; let start = 0, part = 1;
    do {
      let end = Math.min(start + 30000, value.length);
      if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
      const r = s.addRow([...ids, kind, part++, value.slice(start, end)]);
      r.height = Math.min(180, Math.max(30, value.slice(start, end).split('\n').length * 15));
      start = end;
    } while (start < value.length);
  }
  for (const a of attempts) {
    const s = a.summary;
    const activity = a.editorActivity;
    const history = a.checkpointHistory;
    for (const checkpoint of history?.checkpoints ?? []) {
      textRows(checkpoints, [s.id, checkpoint.sequence, time.excelDate(checkpoint.receivedAt), time.parts(checkpoint.receivedAt)?.offset,
        checkpoint.activity.elapsedMs, checkpoint.activity.keydownCount, checkpoint.activity.bulkChangeCount ?? null],
        checkpoint.activity.unexplainedBulkChangeCount ?? 'Not recorded', checkpoint.sourceCode);
    }
    checkpoints.getColumn(3).numFmt = dateFormat;
    if (!activity) activitySummary.addRow([s.id, 'Recording status', null, null, null, null, 'Not recorded']);
    else {
      for (const area of ['question', 'answer'] as const) {
        const c = activity[area];
        activitySummary.addRow([s.id, area + ' clipboard attempts', c.copy, c.cut, c.paste, c.drop]);
      }
      for (const key of ['keydownCount', 'trustedKeydownCount', 'modelChangeCount', 'unexplainedChangeCount', 'observedPasteCount', 'syntheticEvents', 'insertedCharacters', 'deletedCharacters', 'droppedEvents', 'bulkChangeCount', 'unexplainedBulkChangeCount', 'largestInsertion'] as const) {
        activitySummary.addRow([s.id, key, null, null, null, null, activity[key] ?? 'Not recorded']);
      }
      for (const event of activity.events) {
        const row = activityEvents.addRow([s.id, time.excelDate(activity.startedAt), time.parts(activity.startedAt)?.offset,
          event.offsetMs, event.area, event.kind, event.trusted === null ? 'Not applicable' : event.trusted ? 'Yes' : 'No', event.inserted ?? null, event.deleted ?? null]);
        row.getCell(2).numFmt = dateFormat;
      }
    }
    activitySummary.addRow([s.id, 'Checkpoint status', null, null, null, null, history?.status ?? 'Not recorded']);
    activitySummary.addRow([s.id, 'Final code matches checkpoint', null, null, null, null, history?.finalCodeMatches ?? 'Not recorded']);
    activitySummary.addRow([s.id, 'Checkpoint intervals over 90 seconds', null, null, null, null, history?.reportingGaps ?? 'Not recorded']);
    const r = submissions.addRow([s.id, s.title, s.questionId, s.slug, s.language, time.excelDate(s.submittedAt),
      time.parts(s.submittedAt)?.offset, elapsed(s.durationMs), s.testcasesPassed, s.testcasesTotal, percent(s.passPercentage),
      s.score, s.speedBonus, s.judgeStatus, a.difficulty, a.timeLimitSeconds, a.ipAddress, a.userAgent, a.testcases.length]);
    r.getCell(6).numFmt = dateFormat; r.getCell(8).numFmt = '[h]:mm:ss'; r.getCell(11).numFmt = '0.00%';
    r.getCell(12).numFmt = r.getCell(13).numFmt = '0.00';
    textRows(code, [s.id], 'Submitted code', a.sourceCode);
    textRows(code, [s.id], 'Problem statement', a.prompt);
    textRows(code, [s.id], 'Starter code', a.starterCode);
    textRows(code, [s.id], 'Reference solution', a.referenceSolution);
    for (const t of a.testcases) {
      const row = results.addRow([s.id, t.id, t.ordinal, t.sample ? 'Public' : 'Hidden',
        t.passed === true ? 'Passed' : t.passed === false ? 'Failed' : 'Not recorded', t.judgeStatus, t.execTimeMs, t.memoryKb]);
      row.getCell(5).font = { bold: true, color: { argb: t.passed === true ? 'FF067647' : 'FFB4232B' } };
      textRows(content, [s.id, t.id], 'Input', t.stdin);
      textRows(content, [s.id, t.id], 'Expected output', t.expectedOutput);
      textRows(content, [s.id, t.id], 'Candidate output', t.stdout);
    }
  }
  styleWorkbook(book);
  return book;
}
