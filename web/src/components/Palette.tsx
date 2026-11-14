import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_ITEMS } from "../app/nav";
import { href } from "../app/router";
import { useData } from "../lib/data";
import type { InvestigationsDoc, MatrixDoc } from "../lib/types";
import { NavIcon } from "./NavIcon";
import { IconAsk, IconSearch } from "./icons";

interface Entry { key: string; label: string; about: string; kind: string; to: string; icon: string; hay: string }

/** Quick search over pages, investigations, fire behaviours and response steps. Typing a question sends it to the evidence agent. */
export function Palette({ open, onClose, ready }: { open: boolean; onClose: () => void; ready: boolean }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const inv = useData<InvestigationsDoc>(open && ready ? "investigations.json" : null);
  const mx = useData<MatrixDoc>(open && ready ? "matrix.json" : null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const e: Entry[] = ALL_ITEMS.map((i) => ({ key: "p" + i.path, label: i.label, about: i.about, kind: "Page", to: href(i.path), icon: i.icon, hay: `${i.label} ${i.about}`.toLowerCase() }));
    for (const i of inv.data?.items ?? []) {
      if (!i.scope.in_scope) continue;
      e.push({ key: "i" + i.accession, label: i.acronym ? `${i.acronym} (${i.accession})` : i.accession, about: i.title, kind: "Investigation", to: href(`/evidence/${i.accession}`), icon: "Stack", hay: `${i.acronym} ${i.accession} ${i.title} ${i.hardware} ${i.platform}`.toLowerCase() });
    }
    for (const c of mx.data?.cells ?? []) e.push({ key: "c" + c.id, label: c.name, about: `Fire behaviour · ${c.pillar}`, kind: "Behaviour", to: href(`/playbooks/${c.id}`), icon: "Grid", hay: `${c.name} ${c.pillar} ${c.phase}`.toLowerCase() });
    for (const s of mx.data?.playbook ?? []) e.push({ key: "s" + s.id, label: `${s.n}. ${s.step}`, about: "Response step, with its evidence in two habitats", kind: "Response step", to: href(`/playbooks/step-${s.id}`), icon: "Grid", hay: `${s.step} ${s.why}`.toLowerCase() });
    return e;
  }, [inv.data, mx.data]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = useMemo(() => {
    if (!words.length) return entries.filter((e) => e.kind === "Page");
    return entries.map((e) => ({ e, s: words.every((w) => e.hay.includes(w)) ? (e.label.toLowerCase().startsWith(words[0]) ? 0 : e.label.toLowerCase().includes(words[0]) ? 1 : 2) : -1 }))
      .filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.e).slice(0, 40);
  }, [entries, q]);                                   // eslint-disable-line react-hooks/exhaustive-deps
  const asks = q.trim().length >= 4;
  const askFirst = asks && (words.length >= 3 || q.includes("?") || found.length === 0);   // a sentence is a question; a word or two is a place
  const total = found.length + (asks ? 1 : 0);
  const askAt = askFirst ? 0 : found.length;

  useEffect(() => { if (open) { setQ(""); setAt(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);
  if (!open) return null;

  const go = (i: number) => {
    const to = asks && i === askAt ? `#ask?q=${encodeURIComponent(q.trim())}` : found[i - (askFirst ? 1 : 0)]?.to;
    if (!to) return;
    onClose();
    window.location.hash = to.replace(/^#/, "");
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setAt((v) => Math.min(total - 1, v + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((v) => Math.max(0, v - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(at); }
  };

  const askRow = (
    <li key="ask" role="option" id={`pal-${askAt}`} data-i={askAt} aria-selected={at === askAt} className="palette__item" onMouseEnter={() => setAt(askAt)} onClick={() => go(askAt)}>
      <span className="palette__icon"><IconAsk size={17} /></span>
      <span className="palette__main"><b>Ask the evidence: “{q.trim()}”</b><span>The agent answers from NASA's tables and documents, with sources</span></span>
      <span className="palette__kind">Question</span>
    </li>
  );
  return (
    <div className="palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Quick search" onKeyDown={key}>
        <div className="palette__bar">
          <IconSearch size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a page, an investigation, a behaviour, or ask a question" aria-label="Search" autoComplete="off" spellCheck={false}
                 role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pal-${at}`} />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette__list" id="palette-list" role="listbox" ref={list}>
          {askFirst && askRow}
          {found.map((e, i) => { const n = i + (askFirst ? 1 : 0); return (
            <li key={e.key} role="option" id={`pal-${n}`} data-i={n} aria-selected={at === n} className="palette__item" onMouseEnter={() => setAt(n)} onClick={() => go(n)}>
              <span className="palette__icon"><NavIcon name={e.icon} /></span>
              <span className="palette__main"><b>{e.label}</b><span>{e.about}</span></span>
              <span className="palette__kind">{e.kind}</span>
            </li>
          ); })}
          {asks && !askFirst && askRow}
          {total === 0 && <li className="palette__none">Nothing matches. Type four letters or more to ask the evidence instead.</li>}
        </ul>
        <div className="palette__foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>{entries.length} places</span></div>
      </div>
    </div>
  );
}
