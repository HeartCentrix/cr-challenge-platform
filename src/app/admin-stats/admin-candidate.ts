import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminNav } from './admin-nav';
import { AdminTheme } from './admin-theme';
import { AdminTime } from './admin-time';
import { AdminExport } from './admin-export';
import { AdminStatsApi, AttemptDetail, CandidateDetail, duration } from './admin-stats-api';

@Component({
  selector: 'app-admin-candidate',
  providers: [AdminExport],
  imports: [AdminNav, RouterLink, DecimalPipe],
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
  readonly id = computed(() => this.params().get('id') || '');
  readonly validId = computed(() => /^[1-9]\d*$/.test(this.id()));
  readonly requestedDay = linkedSignal(() => { this.id(); return ''; });
  readonly snapshot = linkedSignal(() => { this.id(); return new Date().toISOString(); });
  readonly page = linkedSignal(() => { this.id(); this.requestedDay(); return 0; });
  readonly candidate = httpResource<CandidateDetail>(() => this.validId()
    ? this.api.request(`/candidates/${this.id()}/history`, { day: this.requestedDay(), timeZone: this.time.zone,
      asOf: this.snapshot(), page: this.page(), size: 10 }) : undefined);
  readonly day = computed(() => this.candidate.value()?.history?.day ?? '');
  readonly scope = computed(() => ({ day: this.day(), timeZone: this.time.zone,
    asOf: this.candidate.value()?.history?.asOf ?? this.snapshot() }));
  readonly selectedAttempt = linkedSignal(() => this.candidate.value()?.attempts.items[0]?.id ?? null);
  readonly attempt = httpResource<AttemptDetail>(() => this.selectedAttempt() && this.candidate.hasValue()
    ? this.api.request(`/candidates/${this.id()}/attempts/${this.selectedAttempt()}`) : undefined);
  readonly duration = duration;
  constructor() {
    effect(() => this.api.handleError(this.candidate.error() || this.attempt.error()));
    effect(() => { this.id(); this.requestedDay(); untracked(() => this.exporter.cancel()); });
  }
  setDay(day: string | null | undefined) {
    if (!day || this.candidate.isLoading()) return;
    this.exporter.cancel();
    this.requestedDay.set(day);
  }
  refresh() {
    this.exporter.cancel();
    this.requestedDay.set('');
    this.page.set(0);
    this.snapshot.set(new Date().toISOString());
    this.candidate.reload();
    this.attempt.reload();
  }
  exportReport() {
    if (!this.candidate.hasValue() || this.candidate.isLoading() || this.candidate.error() || !this.candidate.value().attempts.total) return;
    void this.exporter.candidate(this.candidate.value(), this.attempt.hasValue() ? this.attempt.value() : undefined, this.scope());
  }
}
