let howlerPromise;

export function loadHowler() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Howler runtime requires a browser environment"));
  }

  if (window.Howl && window.Howler) {
    return Promise.resolve({ Howl: window.Howl, Howler: window.Howler });
  }

  howlerPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/howler.min.js";
    script.async = true;
    script.onload = () => {
      if (!window.Howl || !window.Howler) {
        howlerPromise = undefined;
        reject(new Error("Howler script loaded without Howl or Howler globals"));
        return;
      }
      resolve({ Howl: window.Howl, Howler: window.Howler });
    };
    script.onerror = () => {
      howlerPromise = undefined;
      reject(new Error("Failed to load Howler runtime"));
    };
    document.head.appendChild(script);
  });

  return howlerPromise;
}
