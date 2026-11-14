import { useEffect, useState } from "react";

/** Static-first: every artifact is a file under ./data/v1, built by the pipeline from NASA sources. */
const BASE = "./data/v1/";
const cache = new Map<string, Promise<unknown>>();

export function loadJson<T>(name: string): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(BASE + name, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return p as Promise<T>;
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useData<T>(name: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: !!name });
  useEffect(() => {
    if (!name) return;
    let live = true;
    setState({ data: null, error: null, loading: true });
    loadJson<T>(name)
      .then((d) => live && setState({ data: d, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: String(e.message || e), loading: false }));
    return () => {
      live = false;
    };
  }, [name]);
  return state;
}

/** Written last by the pipeline. Its presence means the NASA sync has been derived. */
export interface Manifest {
  schema: string;
  brand: string;
  team: string;
  mascot: string;
  built_at_utc: string;
  nasa: null | {
    synced_at_utc: string;
    search_hits: number;
    investigations_in_scope: number;
    investigations_excluded: number;
    tables: number;
    table_rows: number;
    files_in_ledger: number;
    bytes_in_ledger: number;
    official_resources_used: number;
    official_resources_total: number;
    ledger_head: string;
    ledger_chain_ok: boolean;
    curator_findings?: number;
    envelope_points?: number;
    envelope_points_with_pressure?: number;
    validation_rows?: number | null;
    validation_mean_abs_K?: number | null;
  };
  artifacts: Record<string, { sha256: string; bytes: number; klass: string }>;
}

export const fmtInt = (n: number) => n.toLocaleString("en-US");
export function fmtBytes(n: number): string {
  if (n < 1e3) return `${n} B`;
  if (n < 1e6) return `${(n / 1e3).toFixed(1)} kB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)} GB`;
  return `${(n / 1e12).toFixed(2)} TB`;
}
export function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
export const fix = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
