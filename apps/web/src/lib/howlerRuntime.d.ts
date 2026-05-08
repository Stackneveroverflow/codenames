export class Howl {
  constructor(options: { src: string[]; volume?: number; html5?: boolean });
  play(): number;
  stop(): void;
}

export const Howler: {
  volume(): number;
  volume(volume: number): void;
};

declare global {
  interface Window {
    Howl?: typeof Howl;
    Howler?: typeof Howler;
  }
}

export function loadHowler(): Promise<{ Howl: typeof Howl; Howler: typeof Howler }>;
