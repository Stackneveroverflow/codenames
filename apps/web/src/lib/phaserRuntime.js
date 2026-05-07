let phaserPromise;

export function loadPhaser() {
  if (window.Phaser) {
    return Promise.resolve(window.Phaser);
  }

  phaserPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/phaser.min.js";
    script.async = true;
    script.onload = () => resolve(window.Phaser);
    script.onerror = () => reject(new Error("Failed to load Phaser runtime"));
    document.head.appendChild(script);
  });

  return phaserPromise;
}
