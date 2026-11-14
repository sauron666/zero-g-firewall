/**
 * One file per route, so that people and agents working in parallel replace their own page
 * and nobody edits the router. Until a page is built it says what it will hold.
 */
import { ALL_ITEMS } from "../app/nav";
import { Route } from "../app/router";
import { Manifest } from "../lib/data";
import { Pending } from "./Pending";

export interface PageProps {
  route: Route;
  manifest: Manifest | null;
}

export function stub(path: string) {
  return function Stub({ manifest }: PageProps) {
    return <Pending item={ALL_ITEMS.find((i) => i.path === path)} nasaReady={!!manifest?.nasa} />;
  };
}
