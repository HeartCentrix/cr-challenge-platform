import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AdminNav } from './admin-nav';
import { AdminTheme } from './admin-theme';
import { AdminTime } from './admin-time';
import { AdminExport } from './admin-export';
import { AdminDataCache } from '../admin-auth/admin-data-cache';
import { DateRange, DateRangePicker } from './date-range';
import { StatsChart } from './stats-chart';
import { REGION_OPTIONS } from './regions';
import { AdminStatsApi, CandidateRow, CandidatePage, Overview, duration } from './admin-stats-api';

@Component({
  selector: 'app-admin-stats',
  providers: [AdminExport],
  imports: [AdminNav, RouterLink, DecimalPipe, DateRangePicker, StatsChart],
  templateUrl: './admin-stats.html', styleUrl: './admin-stats.css',
  host: { '[attr.data-theme]': 'theme.mode()', 'class': 'dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStats {
  readonly time = new AdminTime();
  readonly exporter = inject(AdminExport);
  readonly api = inject(AdminStatsApi);
  readonly theme = inject(AdminTheme);
  private readonly cache = inject(AdminDataCache);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly bucket = computed(() => this.query().get('bucket') || 'all');
  readonly search = computed(() => this.query().get('search') || '');
  readonly campaign = computed(() => this.query().get('campaign') || '');
  readonly region = computed(() => (this.query().get('region') || '').toUpperCase());
  readonly regionOptions = REGION_OPTIONS;
  readonly range = computed(() => ({ startDate: this.query().get('startDate') || '', endDate: this.query().get('endDate') || '' }));
  readonly minPercent = computed(() => this.query().get('minPercent') || '0');
  readonly maxPercent = computed(() => this.query().get('maxPercent') || '100');
  readonly filters = computed(() => ({
    search: this.search(), campaign: this.campaign(), region: this.region(), ...this.range(), minPercent: this.minPercent(), maxPercent: this.maxPercent(),
    timeZone: this.time.zone,
  }), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  // A shared snapshot prevents new submissions from shifting aggregates while scrolling.
  readonly snapshot = computed(() => this.cache.snapshot(this.filters()));
  readonly overview = httpResource<Overview>(() => this.api.request('', { ...this.filters(), asOf: this.snapshot() }));
  readonly rows = signal<CandidateRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<unknown>(null);
  readonly nextCursor = signal<number | null>(null);
  readonly loaded = signal(false);
  private request?: Subscription;
  private generation = 0;
  readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
  readonly label = computed(() => this.overview.value()?.buckets.find(b => b.key === this.bucket())?.label || 'All pass rates');
  readonly duration = duration;
  readonly collapsed = signal(window.matchMedia('(max-width: 700px)').matches);
  readonly dragging = signal(false);
  readonly panelWidth = signal(320);
  readonly expanded = computed(() => !this.collapsed() && this.panelWidth() > 320);
  readonly layout = viewChild<ElementRef<HTMLDivElement>>('layout');
  readonly filterError = signal('');
  private resizeStart: { x: number; width: number } | null = null;

  constructor() {
    effect(() => this.api.handleError(this.overview.error() || this.error()));
    effect(() => {
      this.filters(); this.bucket(); this.snapshot();
      untracked(() => {
        this.exporter.cancel();
        this.request?.unsubscribe(); this.generation++;
        this.rows.set([]); this.total.set(0); this.nextCursor.set(null); this.loaded.set(false); this.loading.set(false); this.error.set(null);
        const viewport = this.viewport()?.nativeElement; if (viewport) viewport.scrollTop = 0;
        this.loadMore();
      });
    });
    effect(onCleanup => {
      const element = this.viewport()?.nativeElement;
      if (!element) return;
      const observer = new ResizeObserver(() => this.fillViewport());
      observer.observe(element); onCleanup(() => observer.disconnect());
    });
    this.destroy.onDestroy(() => { this.request?.unsubscribe(); this.generation++; });
  }
  loadMore() {
    if (this.loading() || (this.loaded() && this.nextCursor() === null)) return;
    this.loading.set(true); this.error.set(null);
    const generation = this.generation;
    const params: Record<string, string | number> = { ...this.filters(), asOf: this.snapshot(), bucket: this.bucket(), size: 25 };
    if (this.nextCursor() !== null) params['afterId'] = this.nextCursor()!;
    const { url, ...options } = this.api.request('/candidates', params);
    this.request = this.http.get<CandidatePage>(url, options).subscribe({
      next: page => {
        if (generation !== this.generation) return;
        this.rows.update(previous => [...previous, ...page.items.filter(row => !previous.some(item => item.id === row.id))]);
        this.total.set(page.total); this.nextCursor.set(page.items.length ? page.nextCursor : null); this.loaded.set(true); this.loading.set(false);
        setTimeout(() => { if (generation === this.generation) this.fillViewport(); });
      },
      error: error => { if (generation === this.generation) { this.error.set(error); this.loading.set(false); } },
    });
  }
  exportTable() {
    if (!this.loaded() || this.loading() || this.error()) return;
    void this.exporter.table(this.rows(), this.nextCursor(), this.total(), {
      ...this.filters(), bucket: this.bucket(), asOf: this.snapshot(),
    });
  }
  fillViewport() {
    const view = this.viewport()?.nativeElement;
    if (view && this.nextCursor() !== null && !this.loading() && !this.error()
        && view.scrollHeight - view.scrollTop - view.clientHeight < 180) this.loadMore();
  }
  private update(params: Record<string, string | number | null>) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ...params, page: null }, queryParamsHandling: 'merge' });
  }
  selectBucket(bucket: string) { this.update({ bucket: bucket === 'all' ? null : bucket }); }
  setRange(range: DateRange) { this.update({ startDate: range.startDate || null, endDate: range.endDate || null, bucket: null }); }
  applyFilters(event: Event, search: HTMLInputElement, min: HTMLInputElement, max: HTMLInputElement, campaign: HTMLInputElement, region: HTMLSelectElement) {
    event.preventDefault();
    if (!min.checkValidity() || !max.checkValidity() || Number(min.value) > Number(max.value)) {
      this.filterError.set('Enter a pass-rate range from 0 to 100, with minimum no greater than maximum.'); return;
    }
    this.filterError.set('');
    this.update({ search: search.value.trim() || null, campaign: campaign.value.trim() || null, region: region.value || null, minPercent: min.value || '0', maxPercent: max.value || '100', bucket: null });
  }
  clearFilters() { this.filterError.set(''); this.update({ search: null, campaign: null, region: null, minPercent: null, maxPercent: null, startDate: null, endDate: null, bucket: null }); }
  openCandidate(event: Event, id: number) {
    if (event.target instanceof Element && event.target.closest('a')) return;
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
    event.preventDefault(); void this.router.navigate(['/stats-admin/candidates', id]);
  }
  togglePanel() { this.collapsed.update(value => !value); if (!this.collapsed()) this.panelWidth.set(320); }
  startResize(event: PointerEvent) {
    event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging.set(true);
    this.resizeStart = { x: event.clientX, width: this.panelWidth() };
  }
  resize(event: PointerEvent) {
    if (this.resizeStart) this.setWidth(this.resizeStart.width + this.resizeStart.x - event.clientX);
  }
  endResize() { this.resizeStart = null; this.dragging.set(false); }
  startExpand(event: PointerEvent) {
    event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resizeStart = { x: event.clientX, width: 320 }; this.dragging.set(true);
  }
  expandDrag(event: PointerEvent) {
    if (this.resizeStart && this.resizeStart.x - event.clientX > 8) {
      this.collapsed.set(false); this.panelWidth.set(320); this.endResize();
    }
  }
  resizeKey(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.setWidth(this.panelWidth() + (event.key === 'ArrowLeft' ? 40 : -40)); }
    if (event.key === 'Home') { event.preventDefault(); this.panelWidth.set(320); }
    if (event.key === 'Escape') { this.panelWidth.set(320); }
  }
  private setWidth(width: number) {
    if (width < 320) { this.collapsed.set(true); this.panelWidth.set(320); this.endResize(); return; }
    const maximum = Math.max(320, (this.layout()?.nativeElement.clientWidth || 900) - 32);
    this.panelWidth.set(Math.min(maximum, width));
  }
}
