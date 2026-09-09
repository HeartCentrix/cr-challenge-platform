import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Bucket } from './admin-stats-api';

@Component({
  selector: 'app-stats-chart', imports: [DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-tools"><label for="chartType">Chart type</label><select id="chartType" [value]="type()" (change)="setType($event)"><option value="pie">Pie</option><option value="doughnut">Doughnut</option><option value="bar">Bar</option><option value="line">Line</option></select></div>
    @if (total()) {
      <svg viewBox="0 0 320 260" role="img" [attr.aria-label]="type() + ' chart of candidates by overall test-case pass rate. Use the legend below to filter.'">
        @if (type() === 'pie' || type() === 'doughnut') {
          @for (slice of slices(); track slice.key) {
            <path [attr.d]="slice.path" [attr.fill]="slice.color" [class.dim]="selected() !== 'all' && selected() !== slice.key" (click)="selectedBucket.emit(slice.key)"><title>{{ slice.label }}: {{ slice.count }} candidates ({{ slice.candidatePercentage }}%)</title></path>
          }
          @if (type() === 'doughnut') { <circle cx="160" cy="125" r="64" class="hole"/><text x="160" y="125" text-anchor="middle" class="total">{{ total() }}</text><text x="160" y="144" text-anchor="middle">candidates</text> }
        } @else {
          @for (tick of ticks(); track tick.value) { <line x1="36" x2="307" [attr.y1]="tick.y" [attr.y2]="tick.y" class="grid"/><text x="29" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.value }}</text> }
          @if (type() === 'line') { <polyline [attr.points]="linePoints()" fill="none" class="line"/> }
          @for (point of points(); track point.key; let i = $index) {
            @if (type() === 'bar') { <rect [attr.x]="point.x - 12" [attr.y]="point.y" width="24" [attr.height]="220 - point.y" rx="3" [attr.fill]="point.color" (click)="selectedBucket.emit(point.key)" [class.dim]="selected() !== 'all' && selected() !== point.key"><title>{{ point.label }}: {{ point.count }} candidates</title></rect> }
            @else { <circle [attr.cx]="point.x" [attr.cy]="point.y" r="6" [attr.fill]="point.color" (click)="selectedBucket.emit(point.key)"><title>{{ point.label }}: {{ point.count }} candidates</title></circle> }
            <text [attr.x]="point.x" y="240" text-anchor="middle">{{ i + 1 }}</text>
          }
        }
      </svg>
    } @else { <div class="empty">No candidates in this selection</div> }
    <div class="legend" aria-label="Filter by overall test-case pass rate">
      <button class="all" type="button" [class.active]="selected() === 'all'" [attr.aria-pressed]="selected() === 'all'" (click)="selectedBucket.emit('all')"><span>All pass rates</span><strong>{{ total() }}</strong></button>
      @for (bucket of buckets(); track bucket.key; let i = $index) {
        <button type="button" [class.active]="selected() === bucket.key" [attr.aria-pressed]="selected() === bucket.key" (click)="selectedBucket.emit(bucket.key)">
          <span class="swatch" [style.background]="colors[i]"></span><span>{{ type() === 'bar' || type() === 'line' ? (i + 1) + '. ' : '' }}{{ bucket.label }}</span><strong>{{ bucket.count }}</strong><small>{{ bucket.candidatePercentage | number:'1.0-1' }}%</small>
        </button>
      }
    </div>
    <p class="note">Pass rate = passed test cases ÷ all test cases across submissions in the selected dates. Chart percentages show the share of candidates.</p>
  `,
  styles: `
    :host{display:block}.chart-tools{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;color:var(--muted)}
    select{font:inherit;background:var(--surface);color:var(--text);border:1px solid var(--border);padding:7px 10px;border-radius:5px}
    svg{display:block;width:100%;max-height:290px;margin:14px auto}svg path,svg rect,svg circle:not(.hole){cursor:pointer}svg path:hover,svg rect:hover{opacity:.8}svg .dim{opacity:.25}
    svg text{fill:var(--muted);font-size:10px;font-family:inherit}.hole{fill:var(--surface)}svg .total{font-size:28px;font-weight:700;fill:var(--text)}.grid{stroke:var(--border);stroke-dasharray:3 4}.line{stroke:var(--accent);stroke-width:2}
    .legend{display:grid;gap:5px}.legend button{display:flex;align-items:center;gap:8px;width:100%;border:1px solid transparent;border-radius:5px;padding:9px 8px;color:var(--text);background:transparent;text-align:left;font:inherit;font-size:11px;cursor:pointer}.legend strong{margin-left:auto}.legend small{min-width:42px;text-align:right;color:var(--muted)}.legend .swatch{height:8px;width:8px;border-radius:50%;flex:none}.legend button.active{border-color:var(--accent);background:var(--selected)}.legend button:hover{background:var(--selected)}.all{margin-bottom:5px;font-weight:700!important}
    button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.note{font-size:10px;line-height:1.7;color:var(--muted);margin:18px 0 0}.empty{padding:60px 10px;text-align:center;color:var(--muted);font-size:12px}
  `
})
export class StatsChart {
  readonly buckets = input.required<Bucket[]>();
  readonly selected = input('all');
  readonly selectedBucket = output<string>();
  readonly type = signal('pie');
  readonly colors = ['#f25353','#f59e42','#ebcc68','#6cb8a0','#739ee3','#ae8bde','#91949e'];
  readonly total = computed(() => this.buckets().reduce((sum, b) => sum + b.count, 0));
  readonly maximum = computed(() => Math.max(1, ...this.buckets().map(b => b.count)));
  readonly ticks = computed(() => Array.from(new Set([0, Math.ceil(this.maximum() / 2), this.maximum()])).map(value => ({ value, y: 220 - 180 * value / this.maximum() })));
  readonly points = computed(() => this.buckets().map((b, i) => ({ ...b, x: 55 + i * 39, y: 220 - 180 * b.count / this.maximum(), color: this.colors[i] })));
  readonly linePoints = computed(() => this.points().map(p => p.x + ',' + p.y).join(' '));
  readonly slices = computed(() => {
    let angle = -Math.PI / 2;
    return this.buckets().map((b, i) => {
      const span = this.total() ? b.count / this.total() * Math.PI * 2 : 0;
      const x = 160 + 105 * Math.cos(angle), y = 125 + 105 * Math.sin(angle);
      angle += span;
      const endX = 160 + 105 * Math.cos(angle), endY = 125 + 105 * Math.sin(angle);
      const path = span >= Math.PI * 2 - 0.000001 ? 'M 160 20 A 105 105 0 1 1 160 230 A 105 105 0 1 1 160 20 Z'
        : 'M 160 125 L ' + x + ' ' + y + ' A 105 105 0 ' + (span > Math.PI ? 1 : 0) + ' 1 ' + endX + ' ' + endY + ' Z';
      return { ...b, color: this.colors[i], path };
    }).filter(b => b.count > 0);
  });
  setType(event: Event) { this.type.set((event.target as HTMLSelectElement).value); }
}
