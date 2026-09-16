/** Best-effort browser shortcut deterrent, NOT a security boundary.
 * Browser menus, already-open tools and remote debugging cannot be blocked by a page.
 * The local override is intentionally not authentication and grants no API access.
 */
export class ChallengeDevtoolsGuard {
  private readonly listeners = new AbortController();
  private readonly phrase = 'ariaflare';
  private matchedCharacters = 0;
  private unlocked = false;

  constructor(doc: Document) {
    const options = { capture: true, signal: this.listeners.signal };
    doc.addEventListener('keydown', event => this.keydown(event), options);
    doc.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
    }, options);
    doc.addEventListener('focusin', () => { this.matchedCharacters = 0; }, options);
  }

  private keydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const windowsTools = event.ctrlKey && !event.metaKey && !event.altKey
      && ((event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) || (!event.shiftKey && key === 'u'));
    const macTools = event.metaKey && event.altKey && !event.ctrlKey && ['i', 'j', 'c', 'k', 'u'].includes(key);
    if (key === 'f12' || windowsTools || macTools) {
      this.matchedCharacters = 0;
      if (!this.unlocked) event.preventDefault();
      // Also keep the inspect shortcut (Ctrl+Shift+C) out of clipboard handlers.
      // When unlocked, propagation stops but the browser's default remains enabled.
      event.stopImmediatePropagation();
      return;
    }
    if (this.unlocked) return;
    const target = event.target instanceof Element ? event.target : null;
    const privateField = target?.closest('#modalOverlay')
      || (target?.closest('input, textarea, select, [contenteditable]') && !target.closest('#editorHost'));
    if (privateField || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      this.matchedCharacters = 0;
      return;
    }
    if (key === 'shift') return;
    // Only a prefix length lives in memory; no typed text is retained or transmitted.
    this.matchedCharacters = key === this.phrase[this.matchedCharacters]
      ? this.matchedCharacters + 1 : key === this.phrase[0] ? 1 : 0;
    if (this.matchedCharacters === this.phrase.length) {
      this.unlocked = true;
      this.matchedCharacters = 0;
    }
  }

  dispose(): void {
    this.listeners.abort();
    this.unlocked = false;
    this.matchedCharacters = 0;
  }
}
