let gsapPromise;

export function loadGsap() {
  if (window.gsap) {
    return Promise.resolve(window.gsap);
  }

  gsapPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/gsap.min.js";
    script.async = true;
    script.onload = () => resolve(window.gsap);
    script.onerror = () => reject(new Error("Failed to load GSAP runtime"));
    document.head.appendChild(script);
  });

  return gsapPromise;
}
