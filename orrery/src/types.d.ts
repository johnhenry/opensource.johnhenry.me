/// <reference types="vite/client" />
declare module '@erisera-code/circuit/palette.js' {
  export interface CommandPalettePage { title: string; path?: string; href?: string }
  export interface CommandPaletteAction { title: string; icon?: string; run?: () => void; feedback?: string }
  export interface CommandPaletteOptions {
    mount?: HTMLElement;
    trigger?: HTMLElement;
    pages?: CommandPalettePage[];
    actions?: CommandPaletteAction[];
    openKey?: string;
    metaK?: boolean;
  }
  export interface CommandPaletteInstance { open(): void; close(): void; destroy(): void }
  export function createCommandPalette(opts: CommandPaletteOptions): CommandPaletteInstance;
}
