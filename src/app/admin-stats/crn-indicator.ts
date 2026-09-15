import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CrnMatch } from './admin-stats-api';

export function crnLabel(crn?: CrnMatch | null): string {
  if (!crn || crn.status === 'NOT_CHECKED') return 'Not checked';
  if (crn.status === 'PENDING') return 'Check pending';
  if (crn.status !== 'CHECKED') return 'Check unavailable';
  if (crn.emailMatch && crn.phoneMatch) return 'Email and phone matched';
  if (crn.emailMatch) return 'Email matched';
  if (crn.phoneMatch) return 'Phone matched';
  return 'No email or phone match';
}

@Component({
  selector: 'app-crn-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" role="img" [class.match]="value()?.status === 'CHECKED' && (value()?.emailMatch || value()?.phoneMatch)"
    [class.no-match]="value()?.status === 'CHECKED' && !value()?.emailMatch && !value()?.phoneMatch"
    [attr.aria-label]="'CRN: ' + label(value())" [title]="'CRN: ' + label(value())"></span>
    @if (details()) { <span>{{ label(value()) }}</span> }`,
  styles: `:host { display:inline-flex; align-items:center; gap:8px; }
    .dot { display:inline-block; flex-shrink:0; width:12px; height:12px; border-radius:50%; background:#8b929c; border:1px solid currentColor; }
    .match { background:#22c55e; } .no-match { background:#ef4444; }`,
})
export class CrnIndicator {
  readonly value = input<CrnMatch | null>();
  readonly details = input(false);
  readonly label = crnLabel;
}
