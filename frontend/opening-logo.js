/* Lotus drawing reveal. Product loading runs independently of the intro. */
(() => {
  "use strict";
  if (document.body.dataset.page && document.body.dataset.page !== "home") return;
  const store = window.MAHALAKSHMI_STORE || {};
  const options = store.openingLogo || {};
  if (options.enabled === false) return;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof window.HTMLDialogElement === "undefined") return;
  const seenKey = "mahalakshmi_opening_lotus_seen_v1";
  try {
    if (options.oncePerSession !== false && sessionStorage.getItem(seenKey) === "1") return;
  } catch { /* Private browsing: still allow a brief, dismissible reveal. */ }

  const requestedDuration = Number(options.durationMs);
  const duration = Number.isFinite(requestedDuration) ? Math.min(4000, Math.max(2700, requestedDuration)) : 2700;
  const scriptURL = document.currentScript && document.currentScript.src;
  const logoURL = new URL("assets/mahalakshmi-lotus.png", scriptURL || document.baseURI).href;
  const dialog = document.createElement("dialog");
  dialog.className = "logo-reveal";
  dialog.setAttribute("aria-labelledby", "logoRevealTitle");
  dialog.setAttribute("aria-describedby", "logoRevealSubtitle");
  dialog.innerHTML = `<div class="logo-reveal-content">
    <div class="lotus-art" aria-hidden="true">
      <svg class="lotus-drawing" viewBox="0 0 1536 1024" focusable="false">
        <g class="lotus-traces" fill="none" stroke="#f4d28a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <path pathLength="1" style="--draw-delay:0ms" d="M768 176 C741 223 676 250 686 312 L696 343 C692 297 742 268 768 222 C794 268 844 297 840 343 L850 312 C860 250 795 223 768 176Z"/>
          <path pathLength="1" style="--draw-delay:120ms" d="M768 590 C718 509 635 501 603 414 C581 361 595 296 582 260 C653 281 722 346 768 427 C814 346 883 281 954 260 C941 296 955 361 933 414 C901 501 818 509 768 590Z"/>
          <path pathLength="1" style="--draw-delay:220ms" d="M767 589 C707 517 599 537 557 461 C531 415 525 394 475 378 C537 357 603 392 625 448 C651 488 695 512 767 589Z"/>
          <path pathLength="1" style="--draw-delay:260ms" d="M769 589 C829 517 937 537 979 461 C1005 415 1011 394 1061 378 C999 357 933 392 911 448 C885 488 841 512 769 589Z"/>
          <path pathLength="1" style="--draw-delay:320ms" d="M768 571 C753 472 723 414 640 308 C639 418 647 483 721 531 M768 571 C783 472 813 414 896 308 C897 418 889 483 815 531"/>
          <path pathLength="1" style="--draw-delay:340ms" d="M728 544 C663 529 591 536 548 574 C605 559 674 599 728 544Z M808 544 C873 529 945 536 988 574 C931 559 862 599 808 544Z"/>
          <path pathLength="1" style="--draw-delay:100ms" d="M768 391 C764 375 748 351 750 335 C754 301 782 301 786 335 C788 351 772 375 768 391Z"/>
          <circle class="lotus-dot" cx="768" cy="294" r="7"/>
          <circle class="lotus-dot" cx="768" cy="276" r="3"/>
          <circle class="lotus-dot" cx="768" cy="262" r="2"/>
        </g>
      </svg>
      <img class="lotus-logo lotus-petals" width="1536" height="1024" alt="">
      <img class="lotus-logo lotus-wordmark" width="1536" height="1024" alt="">
    </div>
    <h2 id="logoRevealTitle" class="logo-reveal-title"></h2>
    <p id="logoRevealSubtitle" class="logo-reveal-subtitle"></p>
    <span class="logo-reveal-rule" aria-hidden="true"></span>
  </div>`;
  dialog.querySelector(".logo-reveal-title").textContent = store.name || "MAHALAKSHMI";
  dialog.querySelector(".logo-reveal-subtitle").textContent = store.subtitle || "Cloth Center & Fancy Store";
  const petals = dialog.querySelector(".lotus-petals");
  petals.addEventListener("load", () => dialog.classList.add("logo-image-ready"), { once: true });
  petals.addEventListener("error", () => dialog.classList.add("logo-image-unavailable"), { once: true });
  dialog.querySelectorAll(".lotus-logo").forEach(img => { img.src = logoURL; });

  let finished = false, leaving = false, revealTimer, closeTimer, safetyTimer;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(revealTimer); clearTimeout(closeTimer); clearTimeout(safetyTimer);
    window.removeEventListener("pagehide", finish);
    document.body.classList.remove("logo-reveal-active");
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  const fade = () => {
    if (finished || leaving) return;
    leaving = true;
    dialog.classList.add("is-leaving");
    closeTimer = setTimeout(finish, 340);
  };
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(); });
  dialog.addEventListener("close", finish);
  window.addEventListener("pagehide", finish, { once: true });
  try {
    document.body.append(dialog);
    dialog.showModal();
    document.body.classList.add("logo-reveal-active");
    try { sessionStorage.setItem(seenKey, "1"); } catch { /* No storage is required. */ }
    revealTimer = setTimeout(fade, duration);
    safetyTimer = setTimeout(finish, duration + 800);
  } catch {
    finish();
  }
})();
