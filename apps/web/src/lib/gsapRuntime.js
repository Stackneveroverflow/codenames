let gsapPromise;

export function loadGsap() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("GSAP runtime requires a browser environment"));
  }

  if (window.gsap) {
    return Promise.resolve(window.gsap);
  }

  gsapPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/gsap.min.js";
    script.async = true;
    script.onload = () => {
      if (!window.gsap) {
        gsapPromise = undefined;
        reject(new Error("GSAP script loaded without gsap global"));
        return;
      }
      resolve(window.gsap);
    };
    script.onerror = () => {
      gsapPromise = undefined;
      reject(new Error("Failed to load GSAP runtime"));
    };
    document.head.appendChild(script);
  });

  return gsapPromise;
}
