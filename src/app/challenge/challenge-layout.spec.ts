import { TestBed } from '@angular/core/testing';
import { Challenge } from './challenge';

describe('Challenge follow-up layout', () => {
  it('keeps one action and replaces the coding columns with a combined follow-up card', () => {
    // Layout check without starting Monaco, network requests, or a candidate session.
    spyOn(Challenge.prototype, 'ngAfterViewInit');
    const fixture = TestBed.createComponent(Challenge);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const workspace = page.querySelector('.challenge-workspace')!;
    const action = page.querySelector('#submitBtn')!;
    expect(page.querySelectorAll('#submitBtn').length).toBe(1);
    expect(workspace.querySelector(':scope > .problem-prompt')).not.toBeNull();
    expect(workspace.querySelector(':scope > .editor')).not.toBeNull();
    expect(workspace.querySelector(':scope > app-followup')).not.toBeNull();
    expect(action.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const prompt = 'Complete the answer <script>not HTML</script>';
    fixture.componentInstance.followup.set({round:1,question:{ordinal:1,kind:'FIB',prompt,options:[]},submit:async () => {}});
    fixture.detectChanges();
    expect(workspace.querySelector('app-followup section')).not.toBeNull();
    expect(workspace.querySelector('app-followup button')).toBeNull();
    expect(page.querySelectorAll('.cta').length).toBe(1);
    const card = workspace.querySelector('app-followup section')!;
    expect(card.querySelector('#followupPrompt')!.textContent).toBe(prompt);
    expect(card.querySelector('script')).toBeNull();
    expect(card.querySelector('textarea')).not.toBeNull();
    expect(workspace.classList.contains('followup-mode')).toBeTrue();
    expect((workspace.querySelector('#problemPrompt') as HTMLElement).hidden).toBeTrue();
    expect((workspace.querySelector('#problemTitle')!.parentElement as HTMLElement).hidden).toBeTrue();

    // Each follow-up replaces the left prompt, then the coding prompt returns.
    fixture.componentInstance.followup.update(view => ({...view!, question:{...view!.question,ordinal:5,prompt:'Final follow-up'}}));
    fixture.detectChanges();
    expect(workspace.querySelector('#followupPrompt')!.textContent).toBe('Final follow-up');
    expect(workspace.querySelector('#followupTitle')!.textContent).toContain('Follow-up 5 of 5');
    fixture.componentInstance.followup.set(null);
    fixture.detectChanges();
    expect(workspace.querySelector('#followupPrompt')).toBeNull();
    expect(workspace.classList.contains('followup-mode')).toBeFalse();
    expect((workspace.querySelector('#problemPrompt') as HTMLElement).hidden).toBeFalse();
    expect((workspace.querySelector('#problemTitle')!.parentElement as HTMLElement).hidden).toBeFalse();
  });
});
