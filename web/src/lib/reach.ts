/**
 * A part of the page that scrolls by itself (a wide table on a phone, a long list in a fixed box)
 * must be reachable without a pointer. Such a box gets a tab stop, the role of a region and a name
 * taken from the nearest heading; when it stops scrolling, the tab stop is taken away again.
 */
const BOXES = ".table-wrap, .scroll-y, .scroll-x, .inv__long, pre.block, .chat__log";

export function nameOf(el: Element): string {
  const host = el.closest("section, details, .panel, .dpanel, main");
  const head = host?.querySelector("h2, h3, summary, .panel__title, h1");
  const text = head?.textContent?.replace(/\s+/g, " ").trim();
  return text ? `${text.slice(0, 80)}: scrolls` : "A table that scrolls";
}

export function markScrollers(root: ParentNode = document): number {
  let n = 0;
  root.querySelectorAll<HTMLElement>(BOXES).forEach((el) => {
    const scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (scrolls) {
      n++;
      if (el.hasAttribute("tabindex")) return;
      el.tabIndex = 0;
      el.dataset.reach = "1";
      if (!el.hasAttribute("role")) el.setAttribute("role", "region");
      if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", nameOf(el));
    } else if (el.dataset.reach === "1") {
      el.removeAttribute("tabindex"); el.removeAttribute("role"); el.removeAttribute("aria-label");
      delete el.dataset.reach;
    }
  });
  return n;
}

/** Keeps the marks true while the page changes: after new content arrives and when the window is resized. */
export function keepScrollersReachable(): () => void {
  let timer = 0;
  const later = () => { if (timer) return; timer = window.setTimeout(() => { timer = 0; markScrollers(); }, 120); };      // at most every 120 ms, even while a page animates
  const seen = new MutationObserver(later);
  seen.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", later);
  later();
  return () => { seen.disconnect(); window.removeEventListener("resize", later); window.clearTimeout(timer); };
}
