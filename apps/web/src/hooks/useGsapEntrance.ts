import { useEffect } from "react";
import type { RefObject } from "react";

import { loadGsap } from "../lib/gsapRuntime";

export function useGsapEntrance(scope: RefObject<HTMLElement | null>, trigger: unknown) {
  useEffect(() => {
    const currentScope = scope.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!currentScope || reduceMotion) {
      return;
    }

    let context: { revert: () => void } | null = null;
    let active = true;

    loadGsap()
      .then((gsap) => {
        if (!active) {
          return;
        }

        context = gsap.context(() => {
          const panels = currentScope.querySelectorAll("[data-animate='panel']");
          if (panels.length > 0) {
            gsap.from(panels, {
              autoAlpha: 0,
              y: 12,
              duration: 0.36,
              ease: "power2.out",
              stagger: 0.05,
            });
          }
        }, currentScope);
      })
      .catch(() => {
        // CSS transitions still provide baseline feedback when GSAP is unavailable.
      });

    return () => {
      active = false;
      context?.revert();
    };
  }, [scope, trigger]);
}
