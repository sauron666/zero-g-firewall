/**
 * The evidence pointer: a thin line from the companion to each source an answer cites, one after another.
 * With reduced motion, or when the companion is hidden, the sources are only marked.
 */
export function point(targets: Element[], hold = 950): () => void {
  const from = Array.from(document.querySelectorAll<HTMLElement>("[data-iskra]")).find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0);   // the one on screen: in the rail, in the top bar or in the tour
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timers: number[] = [];
  let svg: SVGSVGElement | null = null;
  const clean = () => { timers.forEach(clearTimeout); svg?.remove(); targets.forEach((t) => t.classList.remove("is-pointed")); };
  if (!targets.length) return clean;
  if (!from || reduce) {
    targets.forEach((t) => t.classList.add("is-pointed"));
    timers.push(window.setTimeout(clean, hold * 2));
    return clean;
  }
  const NS = "http://www.w3.org/2000/svg";
  svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "tether");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(NS, "path");
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("r", "4");
  svg.append(line, dot);
  document.body.append(svg);
  targets.slice(0, 5).forEach((t, i) => {
    timers.push(window.setTimeout(() => {
      targets.forEach((x) => x.classList.remove("is-pointed"));
      const a = from.getBoundingClientRect(), b = t.getBoundingClientRect();
      const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2;
      const x2 = Math.min(window.innerWidth - 8, Math.max(8, b.left + 10)), y2 = Math.min(window.innerHeight - 8, Math.max(8, b.top + Math.min(20, b.height / 2)));
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 40;                 // a shallow arc, so the line reads as a tether and not as a rule on the page
      line.setAttribute("d", `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`);
      const len = line.getTotalLength();
      line.style.strokeDasharray = `${len}`;
      line.style.strokeDashoffset = `${len}`;
      line.getBoundingClientRect();                                        // let the start state apply before the transition
      line.style.transition = `stroke-dashoffset ${Math.round(hold * 0.45)}ms ease-out`;
      line.style.strokeDashoffset = "0";
      dot.setAttribute("cx", String(x2)); dot.setAttribute("cy", String(y2));
      t.classList.add("is-pointed");
    }, i * hold));
  });
  timers.push(window.setTimeout(clean, Math.min(5, targets.length) * hold + 500));
  return clean;
}
