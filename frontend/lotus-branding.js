/* Uses the supplied logo; does not change products, checkout or admin code. */
(() => {
  "use strict";
  const scriptURL = document.currentScript && document.currentScript.src;
  const logoURL = new URL("assets/mahalakshmi-lotus.png", scriptURL || document.baseURI).href;
  const paint = () => {
    document.querySelectorAll(".brand-mark:not(.lotus-brand-mark), .banner-mark:not(.lotus-banner-mark)").forEach(mark => {
      const banner = mark.classList.contains("banner-mark");
      mark.classList.add(banner ? "lotus-banner-mark" : "lotus-brand-mark");
      mark.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "brand-lotus");
      svg.setAttribute("viewBox", "420 110 700 500");
      svg.setAttribute("focusable", "false");
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", logoURL);
      image.setAttribute("width", "1536");
      image.setAttribute("height", "1024");
      svg.append(image);
      mark.replaceChildren(svg);
    });
  };
  paint();
  // The storefront renders its header dynamically and may render it again.
  const host = document.getElementById("storeHeader");
  if (host && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(paint);
    observer.observe(host, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }
})();
