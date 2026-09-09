import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AdminTheme {
  readonly mode = signal<'dark' | 'light'>(this.saved());
  toggle() {
    this.mode.update(value => value === 'dark' ? 'light' : 'dark');
    try { localStorage.setItem('challenge-admin-theme', this.mode()); } catch { /* Storage may be unavailable. */ }
  }
  private saved(): 'dark' | 'light' {
    try { return localStorage.getItem('challenge-admin-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  }
}
