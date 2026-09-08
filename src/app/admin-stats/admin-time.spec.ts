import { AdminTime } from './admin-time';

describe('Admin local timestamps', () => {
  it('converts UTC timestamps to the local date, time and offset, including date rollover', () => {
    const time = new AdminTime('Asia/Kolkata');
    expect(time.format('2026-09-01T20:45:00Z')).toBe('2026-09-02 02:15:00 UTC+05:30');
    expect(time.date('2026-09-01T20:45:00Z')).toBe('2026-09-02');
    expect(time.excelDate('2026-09-01T20:45:00Z')?.toISOString()).toBe('2026-09-02T02:15:00.000Z');
  });
  it('uses the historical daylight-saving offset, not the current offset', () => {
    const time = new AdminTime('America/New_York');
    expect(time.format('2026-01-01T03:00:00Z')).toBe('2025-12-31 22:00:00 UTC-05:00');
    expect(time.format('2026-07-01T03:00:00Z')).toBe('2026-06-30 23:00:00 UTC-04:00');
    expect(time.format('2026-11-01T05:30:00Z')).toBe('2026-11-01 01:30:00 UTC-04:00');
    expect(time.format('2026-11-01T06:30:00Z')).toBe('2026-11-01 01:30:00 UTC-05:00');
  });
  it('uses midnight at 00:00 and handles missing or invalid timestamps', () => {
    const time = new AdminTime('UTC');
    expect(time.format('2026-01-01T00:00:00Z')).toBe('2026-01-01 00:00:00 UTC+00:00');
    expect(time.format(null)).toBe('Not recorded');
    expect(time.excelDate('invalid')).toBeNull();
  });
});
