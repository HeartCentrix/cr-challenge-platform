import { ChallengeDevtoolsGuard } from './challenge-devtools-guard';
import { EditorActivity } from './editor-activity';

describe('Candidate DevTools shortcut guard', () => {
  let guard: ChallengeDevtoolsGuard;
  let portal: HTMLElement;
  const shortcuts: KeyboardEventInit[] = [
    { key: 'F12' }, { key: 'F12', shiftKey: true },
    ...['I', 'J', 'C', 'K'].map(key => ({ key, ctrlKey: true, shiftKey: true })),
    ...['i', 'j', 'c', 'k', 'u'].map(key => ({ key, metaKey: true, altKey: true })),
    { key: 'u', ctrlKey: true },
  ];
  const fire = (init: KeyboardEventInit, target: EventTarget = document.body) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const type = (text: string, target: EventTarget = document.body) => {
    for (const key of text) fire({ key }, target);
  };
  beforeEach(() => {
    portal = document.createElement('div');
    portal.innerHTML = '<div id="editorHost"><textarea></textarea></div><div id="modalOverlay"><input></div>';
    document.body.append(portal);
    guard = new ChallengeDevtoolsGuard(document);
  });
  afterEach(() => { guard.dispose(); portal.remove(); });

  it('cancels common Windows, Linux and macOS inspection shortcuts', () => {
    for (const shortcut of shortcuts) expect(fire(shortcut).defaultPrevented).toBeTrue();
  });
  it('cancels right-click menus, including while personal details have focus', () => {
    for (const target of [document.body, portal.querySelector('input')!]) {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
    }
  });
  it('preserves typing, undo, redo, navigation and zoom shortcuts', () => {
    for (const shortcut of [{ key: 'a' }, { key: 'Tab' }, { key: 'Enter' }, { key: 'Escape' },
      { key: 'z', ctrlKey: true }, { key: 'z', metaKey: true, shiftKey: true }, { key: '+', ctrlKey: true }]) {
      expect(fire(shortcut).defaultPrevented).toBeFalse();
    }
  });
  it('enables shortcuts after the exact phrase, case-insensitively', () => {
    type('ariaflar');
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
    type('ARIAFLARE');
    for (const shortcut of shortcuts) expect(fire(shortcut).defaultPrevented).toBeFalse();
  });
  it('does not combine partial phrases across mistakes or focus changes', () => {
    type('ariaxflare');
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
    type('aria');
    portal.querySelector('textarea')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    type('flare');
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
  });
  it('does not inspect personal-detail typing or accept a pasted phrase', () => {
    type('ariaflare', portal.querySelector('input')!);
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
    document.body.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: 'ariaflare', bubbles: true }));
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
  });
  it('ignores composed and repeated keys for the override', () => {
    for (const key of 'ariaflare') fire({ key, isComposing: true });
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
    for (const key of 'ariaflare') fire({ key, repeat: true });
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
  });
  it('keeps clipboard prevention and telemetry active after unlocking, but permits inspect', () => {
    const activity = new EditorActivity(portal, {
      getValue: () => '', onDidChangeModelContent: () => ({ dispose() {} }), onDidPaste: () => ({ dispose() {} }),
    }, 'fixture');
    try {
      type('ariaflare');
      const answer = portal.querySelector('textarea')!;
      expect(fire({ key: 'c', ctrlKey: true, shiftKey: true }, answer).defaultPrevented).toBeFalse();
      expect(activity.snapshot().answer.copy).toBe(0);
      expect(fire({ key: 'v', ctrlKey: true }, answer).defaultPrevented).toBeTrue();
      expect(activity.snapshot().answer.paste).toBe(1);
      expect(fire({ key: 'c', ctrlKey: true }, answer).defaultPrevented).toBeTrue();
      expect(activity.snapshot().answer.copy).toBe(1);
    } finally { activity.dispose(); }
  });
  it('removes restrictions on route destruction and starts locked on a new visit', () => {
    type('ariaflare');
    guard.dispose();
    expect(fire({ key: 'F12' }).defaultPrevented).toBeFalse();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBeFalse();
    guard = new ChallengeDevtoolsGuard(document);
    expect(fire({ key: 'F12' }).defaultPrevented).toBeTrue();
  });
});
