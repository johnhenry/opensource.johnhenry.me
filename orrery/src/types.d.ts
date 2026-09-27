/// <reference types="vite/client" />
declare module '@erisera-code/circuit/theme-toggle.js' {
  export function initThemeToggle(opts?: { root?: HTMLElement; button?: HTMLElement | null; useDataAttribute?: boolean }): { get(): string; set(mode: string): void };
}
