import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';

export interface DateRange { startDate: string; endDate: string; }
export function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function parseDate(value: string): Date { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); }

@Component({
  selector: 'app-date-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'position()' },
  template: `
    <button #trigger type="button" class="trigger" (click)="open($event)" popovertarget="calendarPanel" aria-haspopup="dialog" aria-controls="calendarPanel" [attr.aria-expanded]="opened()">▦ {{ label() }}</button>
    <div #calendar id="calendarPanel" class="calendar-popover" popover="auto" role="dialog" aria-modal="false" aria-labelledby="calendarTitle" (toggle)="syncOpened()">
      <div class="top"><div><p class="eyebrow">SUBMISSION DATES</p><h3 id="calendarTitle">{{ singleDay() ? 'Choose a report day' : 'Choose a date range' }}</h3></div><button type="button" (click)="close()" aria-label="Close calendar">×</button></div>
      <p class="hint" aria-live="polite">{{ singleDay() ? 'Select one day for the detail view and export.' : start() && !end() ? 'Now choose the end date.' : 'Select a start date, then an end date.' }}</p>
      <div class="month-nav">
        <button type="button" (click)="moveMonth(-1)" aria-label="Previous month">‹</button>
        <label class="sr-only" for="calendarMonth">Month</label><select id="calendarMonth" [value]="month().getMonth()" (change)="chooseMonth($event)">
          @for (name of months; track name; let i = $index) { <option [value]="i" [selected]="i === month().getMonth()">{{ name }}</option> }
        </select>
        <label class="sr-only" for="calendarYear">Year</label><input id="calendarYear" type="number" min="1900" max="9998" [value]="month().getFullYear()" (change)="chooseYear($event)">
        <button type="button" (click)="moveMonth(1)" aria-label="Next month">›</button>
      </div>
      <div class="week" aria-hidden="true">@for (day of weekdays; track $index) { <span>{{ day }}</span> }</div>
      <div class="days" role="group" aria-label="Calendar dates">
        @for (day of days(); track day.key) {
          <button type="button" [attr.data-date]="day.key" [class.other]="!day.current" [class.range]="inRange(day.key)"
            [class.endpoint]="day.key === start() || day.key === end()" [class.today]="day.key === today"
            [attr.aria-label]="day.label" [attr.aria-pressed]="inRange(day.key)" [attr.aria-current]="day.key === today ? 'date' : null"
            [tabIndex]="day.key === focused() ? 0 : -1" (click)="pick(day.key)" (keydown)="navigate($event, day.key)">{{ day.number }}</button>
        }
      </div>
      <div class="selection" aria-live="polite"><span>{{ start() || 'Start date' }}</span>@if (!singleDay()) { <span>→</span><span>{{ end() || 'End date' }}</span> }</div>
      <p class="hint">{{ singleDay() ? 'Full selected day' : 'Includes both dates' }} · {{ timeZone }}</p>
      <div class="actions">@if (!singleDay()) { <button type="button" (click)="clear()">Clear dates</button> }<button type="button" class="apply" [disabled]="!start() || !end()" (click)="apply()">{{ singleDay() ? 'Apply day' : 'Apply range' }}</button></div>
    </div>`,
  styles: `
    :host{display:block;font-size:12px}button,select,input{font:inherit;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:8px;cursor:pointer}
    .trigger{white-space:nowrap}.calendar-popover{position:fixed;inset:auto;margin:0;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;width:300px;max-width:calc(100vw - 24px);overflow:auto;box-sizing:border-box;box-shadow:0 8px 28px #0005}
    .calendar-popover::backdrop{background:transparent;backdrop-filter:none}.top,.month-nav,.actions,.selection{display:flex;align-items:center;justify-content:space-between;gap:8px}.top button{font-size:19px;line-height:1;padding:4px 8px}h3{margin:4px 0;font-size:15px}.eyebrow{font-size:8px;letter-spacing:.14em;color:var(--accent);margin:0}.hint{font-size:10px;color:var(--muted);margin:9px 0}
    .month-nav{margin:12px 0 8px}.month-nav select{flex:1;min-width:0}.month-nav input{width:60px;padding:6px 4px}.month-nav button,.month-nav select{padding:6px}.week,.days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:2px}.week{color:var(--muted);font-size:9px;margin:8px 0}.days button{border:1px solid transparent;background:transparent;padding:6px 0;border-radius:4px;min-height:29px}.days button.other{color:var(--muted)}.days button.range{background:var(--selected)}.days button.endpoint{background:var(--accent);color:var(--accent-ink);font-weight:700}.days button.today{border-color:var(--accent)}
    button:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.selection{background:var(--bg);padding:8px;border-radius:5px;font-size:10px;margin-top:10px}.actions{border-top:1px solid var(--border);padding-top:10px}.actions button{font-size:11px;padding:7px 9px}.apply{background:var(--accent);color:var(--accent-ink);font-weight:700}button:disabled{opacity:.45;cursor:not-allowed}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
  `
})
export class DateRangePicker {
  readonly singleDay = input(false);
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly value = input<DateRange>({ startDate: '', endDate: '' });
  readonly changed = output<DateRange>();
  readonly calendar = viewChild.required<ElementRef<HTMLDivElement>>('calendar');
  readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  readonly opened = signal(false);
  readonly start = signal('');
  readonly end = signal('');
  readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly today = dateKey(new Date());
  readonly focused = signal(this.today);
  readonly months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  readonly weekdays = ['S','M','T','W','T','F','S'];
  readonly label = computed(() => this.singleDay() ? this.value().startDate || 'Select day' : this.value().startDate ? this.value().startDate + ' → ' + this.value().endDate : 'All dates');
  readonly days = computed(() => {
    const month = this.month(); const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      return { key: dateKey(date), number: date.getDate(), current: date.getMonth() === month.getMonth(), label: date.toLocaleDateString(undefined, { dateStyle: 'full' }) };
    });
  });
  open(event?: Event) {
    event?.preventDefault();
    if (this.opened()) { this.close(); return; }
    this.start.set(this.value().startDate); this.end.set(this.value().endDate);
    const date = this.start() ? parseDate(this.start()) : new Date();
    this.month.set(new Date(date.getFullYear(), date.getMonth(), 1)); this.focused.set(dateKey(date));
    this.opened.set(true); this.position(); this.calendar().nativeElement.showPopover();
  }
  syncOpened() { this.opened.set(this.calendar().nativeElement.matches(':popover-open')); }
  position() {
    if (!this.opened()) return;
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const panel = this.calendar().nativeElement;
    const width = Math.min(300, window.innerWidth - 24);
    panel.style.left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)) + 'px';
    panel.style.top = anchor.bottom + 6 + 'px';
    panel.style.maxHeight = Math.max(80, window.innerHeight - anchor.bottom - 18) + 'px';
  }
  close() {
    this.calendar().nativeElement.hidePopover(); this.opened.set(false);
    this.trigger().nativeElement.focus();
  }
  pick(key: string) {
    this.focused.set(key);
    if (this.singleDay()) { this.start.set(key); this.end.set(key); return; }
    if (!this.start() || this.end()) { this.start.set(key); this.end.set(''); }
    else if (key < this.start()) { this.end.set(this.start()); this.start.set(key); }
    else this.end.set(key);
  }
  inRange(key: string) { return key === this.start() || (!!this.end() && key >= this.start() && key <= this.end()); }
  moveMonth(delta: number) {
    const m = this.month(); const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
    if (next.getFullYear() < 1900 || next.getFullYear() > 9998) return;
    this.month.set(next); this.focused.set(dateKey(next));
  }
  chooseMonth(event: Event) { const m = this.month(); this.moveMonth(Number((event.target as HTMLSelectElement).value) - m.getMonth()); }
  chooseYear(event: Event) {
    const year = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(year) && year >= 1900 && year <= 9998) this.moveMonth((year - this.month().getFullYear()) * 12);
  }
  navigate(event: KeyboardEvent, key: string) {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in delta)) return;
    event.preventDefault(); const date = parseDate(key); date.setDate(date.getDate() + delta[event.key]);
    this.month.set(new Date(date.getFullYear(), date.getMonth(), 1)); this.focused.set(dateKey(date));
    setTimeout(() => this.calendar().nativeElement.querySelector<HTMLButtonElement>('[data-date="' + this.focused() + '"]')?.focus());
  }
  apply() { if (this.start() && this.end()) { this.changed.emit({ startDate: this.start(), endDate: this.end() }); this.close(); } }
  clear() { this.changed.emit({ startDate: '', endDate: '' }); this.close(); }
}
