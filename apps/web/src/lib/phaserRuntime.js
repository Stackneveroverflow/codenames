let phaserPromise;

export function loadPhaser() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Phaser runtime requires a browser environment"));
  }

  if (window.Phaser) {
    return Promise.resolve(window.Phaser);
  }

  phaserPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/phaser.min.js";
    script.async = true;
    script.onload = () => {
      if (!window.Phaser) {
        phaserPromise = undefined;
        reject(new Error("Phaser script loaded without Phaser global"));
        return;
      }
      resolve(window.Phaser);
    };
    script.onerror = () => {
      phaserPromise = undefined;
      reject(new Error("Failed to load Phaser runtime"));
    };
    document.head.appendChild(script);
  });

  return phaserPromise;
}
