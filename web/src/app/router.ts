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
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  const [p, q = ""] = raw.split("?");
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
