/** Admin-only presentation. API timestamps and elapsed durations remain unchanged. */
export class AdminTime {
  readonly zone: string;
  private readonly formatter: Intl.DateTimeFormat;
  constructor(zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.zone = zone;
    this.formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' });
  }
  parts(value: string | Date | null | undefined) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(this.formatter.formatToParts(date).map(part => [part.type, part.value]));
    return { date: `${parts['year']}-${parts['month']}-${parts['day']}`,
      time: `${parts['hour']}:${parts['minute']}:${parts['second']}`,
      offset: parts['timeZoneName'].replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+00:00') };
  }
  date(value: string | Date | null | undefined) { return this.parts(value)?.date ?? 'Not recorded'; }
  clock(value: string | Date | null | undefined) {
    const p = this.parts(value); return p ? `${p.time} ${p.offset}` : 'Not recorded';
  }
  format(value: string | Date | null | undefined) {
    const p = this.parts(value); return p ? `${p.date} ${p.time} ${p.offset}` : 'Not recorded';
  }
  /** Excel has no time-zone type: store local wall-clock fields, with a separate offset column. */
  excelDate(value: string | Date | null | undefined): Date | null {
    const p = this.parts(value); return p ? new Date(`${p.date}T${p.time}Z`) : null;
  }
}
