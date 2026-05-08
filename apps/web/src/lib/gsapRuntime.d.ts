interface GsapTween {
  kill?: () => void;
}

interface GsapRuntime {
  from: (targets: string | Element[] | NodeListOf<Element>, vars: Record<string, unknown>) => GsapTween;
  context: (callback: () => void, scope?: Element | null) => { revert: () => void };
}

declare global {
  interface Window {
    gsap?: GsapRuntime;
  }
}

export function loadGsap(): Promise<GsapRuntime>;
