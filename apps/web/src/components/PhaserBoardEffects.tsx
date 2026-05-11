import { useEffect, useRef } from "react";
import { loadPhaser } from "../lib/phaserRuntime";

import type { CardOwner, PublicCardState } from "@codenames/shared";

interface PhaserBoardEffectsProps {
  cards: PublicCardState[];
  keyCounts: Record<CardOwner, number>;
  mode: "public" | "key";
  triggerId: string;
}

export function PhaserBoardEffects({ cards, keyCounts, mode, triggerId }: PhaserBoardEffectsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const keyCountsSignature = `${keyCounts.red}-${keyCounts.blue}-${keyCounts.neutral}-${keyCounts.assassin}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let game: { destroy(removeCanvas?: boolean): void } | null = null;
    let active = true;

    loadPhaser()
      .then((Phaser) => {
        if (!active) {
          return;
        }

        const scene = createEffectsScene(Phaser, cards.length, keyCounts, mode);
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host,
          transparent: true,
          width: host.clientWidth,
          height: host.clientHeight,
          scene,
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          input: {
            activePointers: 1,
          },
        });
      })
      .catch(() => {
        // Visual effects are optional; the React game board remains authoritative.
      });

    return () => {
      active = false;
      game?.destroy(true);
    };
  }, [cards.length, keyCountsSignature, mode, triggerId]);

  return <div ref={hostRef} className="phaser-effects" aria-hidden="true" />;
}

function createEffectsScene(Phaser: Awaited<ReturnType<typeof loadPhaser>>, cardCount: number, keyCounts: Record<CardOwner, number>, mode: "public" | "key") {
  return class EffectsScene extends Phaser.Scene {
    constructor() {
      super("board-effects");
    }

    create() {
      const { width, height } = this.scale;
      const centerX = width / 2;
      const centerY = height / 2;
      const particles = mode === "key" ? 34 : Math.min(42, Math.max(16, cardCount * 2));
      const danger = keyCounts.assassin > 0 && mode === "key";

      for (let index = 0; index < particles; index += 1) {
        const color = danger && index % 5 === 0 ? 0x9f2d28 : index % 2 === 0 ? 0xc8973f : 0x2a5f84;
        const dot = this.add.circle(centerX, centerY, danger ? 3 : 2, color, 0.72);
        const angle = (Math.PI * 2 * index) / particles;
        const distance = Phaser.Math.Between(60, Math.max(90, Math.min(width, height) * 0.46));

        this.tweens.add({
          targets: dot,
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          alpha: 0,
          scale: Phaser.Math.FloatBetween(0.8, 1.9),
          duration: Phaser.Math.Between(720, 1200),
          ease: "Cubic.easeOut",
          onComplete: () => dot.destroy(),
        });
      }

      const ring = this.add.circle(centerX, centerY, 22, danger ? 0x9f2d28 : 0xc8973f, 0);
      ring.setStrokeStyle(2, danger ? 0x9f2d28 : 0xc8973f, 0.8);
      this.tweens.add({
        targets: ring,
        radius: Math.min(width, height) * 0.42,
        alpha: 0,
        duration: danger ? 1100 : 900,
        ease: "Sine.easeOut",
        onComplete: () => ring.destroy(),
      });
    }
  };
}
