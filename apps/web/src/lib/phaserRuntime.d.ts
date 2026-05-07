declare global {
  interface Window {
    Phaser?: PhaserRuntime;
  }
}

interface PhaserRuntime {
  AUTO: number;
  Game: new (config: Record<string, unknown>) => { destroy(removeCanvas?: boolean): void };
  Scale: {
    RESIZE: string;
    CENTER_BOTH: string;
  };
  Scene: new (key: string) => {
    scale: { width: number; height: number };
    add: {
      circle: (x: number, y: number, radius: number, color: number, alpha?: number) => PhaserCircle;
    };
    tweens: {
      add: (config: Record<string, unknown>) => void;
    };
  };
  Math: {
    Between: (min: number, max: number) => number;
    FloatBetween: (min: number, max: number) => number;
  };
}

interface PhaserCircle {
  destroy: () => void;
  setStrokeStyle: (lineWidth: number, color: number, alpha?: number) => void;
}

export function loadPhaser(): Promise<PhaserRuntime>;
