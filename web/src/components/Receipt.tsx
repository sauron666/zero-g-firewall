import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { KLASS, Klass } from "../lib/klass";
import { IconClose } from "./icons";
import { emit } from "../mascot/bus";

/** Every number has a receipt: where it came from, its hash, how it was made. */
export interface ReceiptData {
  title: string;
  klass: Klass;
  rows: [string, React.ReactNode][];
  notes?: string[];
}
const Ctx = createContext<(r: ReceiptData) => void>(() => {});
export const useReceipt = () => useContext(Ctx);

export function ReceiptProvider({ children }: { children: React.ReactNode }) {
  const [r, setR] = useState<ReceiptData | null>(null);
  const open = useCallback((x: ReceiptData) => { setR(x); emit({ type: "NOTE", text: "Here is where that comes from." }); }, []);
  useEffect(() => {
    if (!r) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setR(null);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [r]);
  return (
    <Ctx.Provider value={open}>
      {children}
      {r && (
        <>
          <div className="receipt-scrim" onClick={() => setR(null)} />
          <aside className="receipt" role="dialog" aria-modal="true" aria-label="Provenance receipt">
            <button className="receipt__close" onClick={() => setR(null)} aria-label="Close receipt" autoFocus><IconClose size={16} /></button>
            <div style={{ fontSize: 11, color: "#6d6656" }}>Zero-G Firewall, provenance receipt</div>
            <h2 style={{ marginTop: 6, paddingRight: 36 }}>{r.title}</h2>
            <hr />
            <dl>
              <dt>class</dt>
              <dd>{KLASS[r.klass].code}: {KLASS[r.klass].meaning}</dd>
              {r.rows.map(([k, v], i) => (
                <div key={i} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {r.notes && r.notes.length > 0 && (
              <>
                <hr />
                {r.notes.map((n, i) => <p key={i} style={{ marginTop: i ? 8 : 0 }}>{n}</p>)}
              </>
            )}
            <hr />
            <p style={{ color: "#6d6656" }}>Independent project. Not endorsed by NASA.</p>
          </aside>
        </>
      )}
    </Ctx.Provider>
  );
}
