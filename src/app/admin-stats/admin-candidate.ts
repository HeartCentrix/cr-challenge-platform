import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminNav } from './admin-nav';
import { AdminTheme } from './admin-theme';
import { AdminTime } from './admin-time';
import { DateRange, DateRangePicker, dateKey } from './date-range';
import { AdminDataCache } from '../admin-auth/admin-data-cache';
import { AdminExport } from './admin-export';
import { AdminStatsApi, AttemptDetail, CandidateDetail, duration } from './admin-stats-api';

@Component({
  selector: 'app-admin-candidate',
  providers: [AdminExport],
  imports: [AdminNav, RouterLink, DecimalPipe, DateRangePicker],
  templateUrl: './admin-candidate.html',
  styleUrl: './admin-stats.css',
  host: { '[attr.data-theme]': 'theme.mode()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCandidate {
  readonly time = new AdminTime();
  readonly exporter = inject(AdminExport);
  readonly theme = inject(AdminTheme);
  readonly api = inject(AdminStatsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly cache = inject(AdminDataCache);
  readonly id = computed(() => this.params().get('id') || '');
  readonly validId = computed(() => /^[1-9]\d*$/.test(this.id()));
  readonly day = linkedSignal(() => { this.id(); return dateKey(new Date()); });
  readonly range = computed(() => ({ startDate: this.day(), endDate: this.day() }));
  readonly scope = computed(() => ({ day: this.day(), timeZone: this.time.zone,
    asOf: this.cache.snapshot({ candidateId: this.id(), day: this.day(), timeZone: this.time.zone }) }));
  readonly page = linkedSignal(() => { this.id(); this.day(); return 0; });
  readonly candidate = httpResource<CandidateDetail>(() => this.validId()
    ? this.api.request(`/candidates/${this.id()}`, { ...this.scope(), page: this.page(), size: 10 }) : undefined);
  readonly selectedAttempt = linkedSignal(() => this.candidate.value()?.attempts.items[0]?.id ?? null);
  readonly attempt = httpResource<AttemptDetail>(() => this.selectedAttempt() && this.candidate.hasValue()
    ? this.api.request(`/candidates/${this.id()}/attempts/${this.selectedAttempt()}`) : undefined);
  readonly duration = duration;
  constructor() {
    effect(() => this.api.handleError(this.candidate.error() || this.attempt.error()));
    effect(() => { this.id(); this.day(); untracked(() => this.exporter.cancel()); });
  }
  setDay(range: DateRange) { if (range.startDate) { this.exporter.cancel(); this.day.set(range.startDate); } }
  exportReport() {
    if (!this.candidate.hasValue() || this.candidate.isLoading() || this.candidate.error() || !this.candidate.value().attempts.total) return;
    void this.exporter.candidate(this.candidate.value(), this.attempt.hasValue() ? this.attempt.value() : undefined, this.scope());
  }
}
