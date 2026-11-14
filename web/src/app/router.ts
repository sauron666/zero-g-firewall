import { useEffect, useState } from "react";

/**
 * Hash routing with plain names: "#paradox", "#evidence--PSI-25".
 * Plain names survive every host (static servers, GitHub Pages, embedded viewers);
 * the older "#/a/b" form is still read.
 */
export interface Route {
  path: string;
  segs: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  const cut = hash.indexOf("?");                       // the query is split off before decoding, so a question may hold "?" and "%"
  let p = cut < 0 ? hash : hash.slice(0, cut);
  try { p = decodeURIComponent(p); } catch { /* a stray percent sign: use the text as it is */ }
  const q = cut < 0 ? "" : hash.slice(cut + 1);
  const segs = p.startsWith("/") ? p.split("/").filter(Boolean) : p.split("--").filter(Boolean);
  const query = new URLSearchParams(q);
  new URLSearchParams(window.location.search).forEach((v, k) => {
    if (!query.has(k)) query.set(k, v);
  });
  return { path: "/" + segs.join("/"), segs, query };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const href = (path: string) => "#" + path.split("/").filter(Boolean).join("--");
export const go = (path: string) => {
  window.location.hash = href(path);
};
