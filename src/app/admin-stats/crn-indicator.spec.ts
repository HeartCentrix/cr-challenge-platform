import { TestBed } from '@angular/core/testing';
import { CrnIndicator, crnLabel } from './crn-indicator';
import { CrnMatch } from './admin-stats-api';

describe('CRN indicator', () => {
  for (const [emailMatch,phoneMatch,label] of [
    [true,true,'Email and phone matched'], [true,false,'Email matched'],
    [false,true,'Phone matched'], [false,false,'No email or phone match'],
  ] as const) {
    it('shows '+label+' with an accessible status dot', () => {
      const fixture=TestBed.createComponent(CrnIndicator);
      const crn: CrnMatch={status:'CHECKED',emailMatch,phoneMatch,checkedAt:'2026-09-16T00:00:00Z'};
      fixture.componentRef.setInput('value',crn);fixture.componentRef.setInput('details',true);fixture.detectChanges();
      const dot: HTMLElement=fixture.nativeElement.querySelector('.dot');
      expect(dot.classList.contains('match')).toBe(emailMatch || phoneMatch);
      expect(dot.classList.contains('no-match')).toBe(!emailMatch && !phoneMatch);
      expect(dot.getAttribute('aria-label')).toBe('CRN: '+label);
      expect(fixture.nativeElement.textContent).toContain(label);
    });
  }
  for (const status of ['NOT_CHECKED','PENDING','ERROR'] as const) {
    it('does not show a false red result for '+status, () => {
      const fixture=TestBed.createComponent(CrnIndicator);
      fixture.componentRef.setInput('value',{status,emailMatch:null,phoneMatch:null,checkedAt:null});fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.no-match')).toBeNull();
      expect(fixture.nativeElement.querySelector('.match')).toBeNull();
    });
  }
  it('supports candidates created before CRN matching was enabled', () => {
    expect(crnLabel(undefined)).toBe('Not checked');
  });
});
