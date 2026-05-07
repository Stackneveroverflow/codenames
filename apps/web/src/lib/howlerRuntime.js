let howlerPromise;

export function loadHowler() {
  if (window.Howl && window.Howler) {
    return Promise.resolve({ Howl: window.Howl, Howler: window.Howler });
  }

  howlerPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/howler.min.js";
    script.async = true;
    script.onload = () => resolve({ Howl: window.Howl, Howler: window.Howler });
    script.onerror = () => reject(new Error("Failed to load Howler runtime"));
    document.head.appendChild(script);
  });

  return howlerPromise;
}
