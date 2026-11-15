import { useEffect, useMemo, useState } from "react";
import { PageProps } from "./stubs";
import { useData, Manifest } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { useReceipt } from "../components/Receipt";
import { LabTabs, download, pushQuery, replaceQuery } from "../components/LabTabs";
import { defaultScenario, fromQuery, PRESETS, ScenarioState, toQuery, U, EvidenceMatch } from "../lib/scenario";
import { briefCsv, briefMarkdown, collect, DIM_LABEL, gapOf, rankEvidence, ROLE_LABEL, STATUS_LABEL, TOL } from "../lib/pmma";
import { href } from "../app/router";
import { Planner } from "../components/Planner";

type Ref = Record<string, unknown>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function Ctl({ label, value, children, hint }: { label: string; value: string; children: React.ReactNode; hint?: string }) {
  return <div className="lc"><span className="lc__top"><span>{label}</span><span className="lc__val">{value}</span></span>{children}{hint && <span className="lc__hint">{hint}</span>}</div>;
}

export function Material({ route, manifest }: PageProps) {
  const rep = useData<any>("reported.json");
  const bass2 = useData<any>("tables/PSI-25__PSI_25_Experimental_table_BASS_II.json");
  const saffire2 = useData<any>("tables/PSI-99__PSI_99_Experimental_table_SAFFIRE_2.json");
  const bass = useData<any>("tables/PSI-26__PSI_26_Experimental_table_BASS.json");
  const flexDoc = useData<any>("ml/flex_k_model.json");
  const receipt = useReceipt();
  const initial = () => { const r = fromQuery(route.query); return r.problems.length ? defaultScenario() : { ...r.state, material: "PMMA" as const }; };
  const [s, setS] = useState<ScenarioState>(initial);
  const [problems, setProblems] = useState<string[]>(() => fromQuery(route.query).problems.map((p) => `${p.field}: ${p.why}`));
  useEffect(() => {                                   // Back/Forward and shared links
    const r = fromQuery(route.query);
    if (route.query.has("v")) { if (r.problems.length) setProblems(r.problems.map((p) => `${p.field}: ${p.why}`)); else { setProblems([]); setS({ ...r.state, material: "PMMA" }); } }
  }, [route.query.toString()]);
  useEffect(() => { replaceQuery("/material", toQuery(s)); }, [s]);
  const set = (p: Partial<ScenarioState>) => setS((x) => ({ ...x, ...p, preset: "custom" }));
  const preset = (id: keyof typeof PRESETS) => { const n = { ...s, ...PRESETS[id].set, material: "PMMA" as const, form: id === "flex_lab" ? "sheet" as const : (PRESETS[id].set.form ?? s.form), preset: id }; pushQuery("/material", toQuery(n)); setS(n); };

  const cands = useMemo(() => collect({ bass2: bass2.data ?? undefined, saffire2: saffire2.data ?? undefined, bass: bass.data ?? undefined }, rep.data ?? null), [rep.data, bass2.data, saffire2.data, bass.data]);
  const ranked = useMemo(() => rankEvidence(cands, s), [cands, s]);
  const top = ranked.slice(0, 3);
  const best = ranked[0];
  const gap = gapOf(best, s);
  const ready = cands.length > 0;
  const future = s.preset === "lunar_habitat" || (s.g ?? 0) > 0;

  const openSource = (m: EvidenceMatch) => {
    const r = m.source.ref as Ref;
    const rows: [string, React.ReactNode][] = r.kind === "table"
      ? [["record", String(r.accession)], ["file", String(r.file)], ["row in file", String(r.row_in_file)], ["file SHA-256", <span className="mono">{String(r.sha256)}</span>], ["ledger entry", String(r.ledger_seq)]]
      : [["document", String(r.source)], ["where", `${r.what ?? ""} ${r.loc ? `(${r.loc}${r.page_pdf ? `, PDF page ${r.page_pdf}` : ""})` : ""}`], ["NTRS", String(r.ntrs_id ?? "")], ["stored text SHA-256", <span className="mono">{String(r.sha256)}</span>], ["ledger entry", String(r.ledger_seq)],
        ...(r.url ? [["open", <a href={String(r.url).replace(/\.txt$/, "")} target="_blank" rel="noreferrer">{String(r.url).replace(/\.txt$/, "")}</a>] as [string, React.ReactNode]] : [])];
    receipt({ title: m.title, klass: m.klass, rows: [...rows, ...m.checks.map((c) => [DIM_LABEL[c.dim].toLowerCase() + " recorded", c.recorded] as [string, React.ReactNode])],
      notes: [m.klass === "literature" ? "Numbers read by pattern from the stored text of the NASA document and cross-checked against another statement in it (pipeline/zgf/reported.py)." : "Values as NASA wrote them in the table; flow display settings are not converted without the fan calibration."] });
  };

  const url = typeof window !== "undefined" ? window.location.href : "";
  const meta = { ledger_head: (manifest as Manifest | null)?.nasa?.ledger_head, built: (manifest as Manifest | null)?.built_at_utc, url };
  const printBrief = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const row = (m: EvidenceMatch) => `<tr><td><b>${esc(m.id)}</b><br><small>${esc(m.klass)} · ${esc(m.role)}</small></td>${m.checks.map((c) => `<td><b>${STATUS_LABEL[c.status]}</b><br>${esc(c.recorded)}</td>`).join("")}</tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Zero-G Firewall brief: PMMA</title><style>
      body{font:14px/1.5 Georgia,serif;color:#111;background:#fff;max-width:900px;margin:24px auto;padding:0 18px} h1{font:700 20px system-ui,sans-serif} h2{font:700 15px system-ui,sans-serif;margin-top:22px}
      table{border-collapse:collapse;width:100%;font:12px system-ui,sans-serif;page-break-inside:auto} td,th{border:1px solid #bbb;padding:5px;vertical-align:top;text-align:left} tr{page-break-inside:avoid} small{color:#555} .note{font:12px system-ui,sans-serif;color:#444}
    </style></head><body>
      <h1>Zero-G Firewall brief: PMMA against NASA's recorded tests</h1>
      <p><b>Question.</b> ${esc(gap.question)}</p>
      <h2>Conditions asked</h2><p>PMMA ${esc(s.form)}; oxygen ${U.pct(s.o2)}; pressure ${U.kpa(s.p_kpa)}; airflow ${U.cms(s.u_m_s)}; gravity ${esc(U.g(s.g))}.</p>
      <h2>Nearest recorded tests</h2><table><tr><th>Test</th>${["Material", "Geometry", "Oxygen", "Pressure", "Airflow", "Gravity"].map((h) => `<th>${h}</th>`).join("")}</tr>${top.map(row).join("")}</table>
      <h2>What was observed</h2><ul>${top.map((m) => `<li><b>${esc(m.id)}</b>: ${m.observed.map((o) => esc(`${o.label} ${o.value}`)).join("; ")}</li>`).join("")}</ul>
      <h2>What this supports</h2><p>${best?.joint ? `${esc(best.id)} was recorded under every asked condition; its observations apply as recorded and to nothing beyond.` : `No test here matches every asked condition at once. The nearest, ${esc(best?.id ?? "none")}, is ${esc(best ? ROLE_LABEL[best.role] : "")}.`}</p>
      <h2>What is missing</h2><ul>${gap.differing.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      <h2>Next question</h2><p>${esc(gap.question)}</p>
      <h2>Sources</h2><ul>${top.map((m) => `<li>${esc(m.id)}: ${esc(m.source.label)}</li>`).join("")}</ul>
      <p class="note">Tolerances are our heuristic: ${esc(TOL.o2.text)}; ${esc(TOL.p.text)}; ${esc(TOL.u.text)}. Dataset: ledger head ${esc(meta.ledger_head ?? "unknown")}, built ${esc(meta.built ?? "unknown")}.<br>Reopen: ${esc(url)}<br>Independent project, not endorsed by NASA. Absence of a test here is not absence in all NASA research.</p>
      <script>setTimeout(()=>print(),300)</script></body></html>`);
    w.document.close();
  };
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked: the address bar holds the same link */ } };

  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--s-5)" }}>
      <LabTabs at="/material" />
      <div className="labhead">
        <div>
          <h1>Material Evidence</h1>
          <p className="lede">Set the conditions of a habitat question and see, condition by condition, which NASA PMMA tests were recorded under them and which were not.</p>
        </div>
        <div className="seg" role="group" aria-label="Question type">
          <button type="button" aria-pressed={!future} onClick={() => preset("saffire_vi")}>Recorded test</button>
          <button type="button" aria-pressed={future} onClick={() => preset("lunar_habitat")}>Future habitat question</button>
        </div>
      </div>
      {problems.length > 0 && <div className="banner">The shared link was not applied: {problems.join("; ")}. The previous case is kept.</div>}

      <div className="lab">
        <aside className="lab__controls" aria-label="Conditions">
          <h2>Conditions asked</h2>
          <Ctl label="Start from" value="">
            <select value={s.preset} onChange={(e) => e.target.value !== "custom" && preset(e.target.value as keyof typeof PRESETS)} aria-label="Preset">
              <option value="saffire_vi">Saffire VI-3, as recorded</option><option value="iss">ISS cabin air</option><option value="lunar_habitat">Lunar habitat</option><option value="custom">Custom</option>
            </select>
          </Ctl>
          {s.preset !== "custom" && s.preset !== "flex_lab" && <p className="lc__hint" style={{ marginTop: -8, marginBottom: 12 }}>{PRESETS[s.preset].note}</p>}
          <Ctl label="Geometry" value={s.form}>
            <div className="seg" role="group" aria-label="Geometry">{(["sheet", "rod", "sphere"] as const).map((f) => <button key={f} type="button" aria-pressed={s.form === f} onClick={() => set({ form: f })}>{f}</button>)}</div>
          </Ctl>
          <Ctl label="Oxygen" value={U.pct(s.o2)}>
            <input type="range" min={0.14} max={0.4} step={0.001} value={s.o2 ?? 0.21} onChange={(e) => set({ o2: +e.target.value })} aria-label="Oxygen mole fraction" />
          </Ctl>
          <Ctl label="Pressure" value={U.kpa(s.p_kpa)}>
            <input type="range" min={30} max={110} step={0.1} value={s.p_kpa ?? 101.3} disabled={s.p_kpa == null} onChange={(e) => set({ p_kpa: +e.target.value })} aria-label="Pressure in kPa" />
            <label className="lc__hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={s.p_kpa == null} onChange={(e) => set({ p_kpa: e.target.checked ? null : 101.3 })} /> pressure unknown</label>
          </Ctl>
          <Ctl label="Airflow" value={U.cms(s.u_m_s)}>
            <input type="range" min={0} max={0.4} step={0.01} value={s.u_m_s ?? 0} onChange={(e) => set({ u_m_s: +e.target.value })} aria-label="Airflow in m/s" />
          </Ctl>
          <Ctl label="Gravity" value={U.g(s.g)}>
            <div className="seg" role="group" aria-label="Gravity">{[[0, "0 g"], [0.165, "Moon"], [0.38, "Mars"], [1, "1 g"]].map(([g, l]) => <button key={l} type="button" aria-pressed={s.g === g} onClick={() => set({ g: g as number })}>{l}</button>)}</div>
          </Ctl>
          <p className="lc__hint">Near means our tolerance: {TOL.o2.text}; {TOL.p.text}; {TOL.u.text}.</p>
        </aside>

        <section className="lab__view" aria-live="polite">
          {!ready && <div className="result"><p className="note">Loading NASA's PMMA records…</p></div>}
          {ready && best && (
            <div className={`result ${best.joint ? "" : "result--abstain"}`}>
              <div className="result__badges"><KlassBadge k={best.klass} />{!best.joint && <span className="st st--not_reported">no joint match</span>}</div>
              <div className="claim claim--m">{best.joint
                ? `${best.id} was recorded under every condition you asked.`
                : `No PMMA test in this evidence was recorded under all of these conditions together.`}</div>
              <p className="result__line" style={{ fontSize: "var(--t-16)" }}>{best.joint ? "What it observed applies to this question as recorded, and to nothing beyond it." : `Nearest: ${best.id}, ${ROLE_LABEL[best.role]}. ${gap.differing.slice(0, 2).join("; ")}.`}</p>
            </div>
          )}
          {top.map((m, i) => (
            <article className="evcard" key={m.id} aria-current={i === 0 ? "true" : undefined} data-klass={m.klass}>
              <div className="evcard__head">
                <div><div className="evcard__title">{m.title}</div><div className="evcard__role">{ROLE_LABEL[m.role]}</div></div>
                <div className="row" style={{ ["--gap" as string]: "6px" }}><KlassBadge k={m.klass} onClick={() => openSource(m)} /><button className="btn btn--quiet btn--sm" onClick={() => openSource(m)}>Open source</button></div>
              </div>
              <div className="rank-vs-app">
                <div>Similarity (orders the list)<div className="meter"><i style={{ width: `${(m.similarity * 100).toFixed(0)}%` }} /></div></div>
                <div>Applicability: <b style={{ color: "var(--ink)" }}>{m.joint ? "joint match" : m.role}</b></div>
              </div>
              <div className="table-wrap">
                <table className="mt">
                  <thead><tr><th>Condition</th><th>Asked</th><th>Recorded</th><th>Status</th><th>Why</th></tr></thead>
                  <tbody>{m.checks.map((c) => (
                    <tr key={c.dim}><td>{DIM_LABEL[c.dim]}</td><td className="num">{c.asked}</td><td className="num">{c.recorded}</td><td><span className={`st st--${c.status}`}>{STATUS_LABEL[c.status]}</span></td><td className="note">{c.why}{c.status === "near" && c.tolerance ? ` (${c.tolerance})` : ""}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="note" style={{ marginTop: 10 }}>Observed: {m.observed.map((o) => `${o.label} ${o.value}`).join("; ")}.</div>
            </article>
          ))}

          {ready && best && (
            <div className="twostate">
              <div data-klass={best.klass}>
                <h3>Recorded test</h3>
                <p className="note">{best.id}: {best.checks.map((c) => `${DIM_LABEL[c.dim].toLowerCase()} ${c.recorded}`).join("; ")}.</p>
                <p style={{ marginTop: 8, fontSize: "var(--t-14)" }}>{best.observed.map((o) => `${o.label}: ${o.value}`).join(". ")}.</p>
              </div>
              <div>
                <h3>{future ? "Future habitat question" : "Your question"}</h3>
                <p className="note">Changed against the record: {gap.differing.length ? gap.differing.join("; ") : "nothing"}.</p>
                <p style={{ marginTop: 8, fontFamily: "var(--font-claim)", fontSize: "var(--t-16)" }}>{gap.question}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="lab__drawer" aria-label="Brief and sources">
          <h2>Brief</h2>
          <p className="note">The same values as on screen, with sources and the dataset it came from.</p>
          <div className="exportbar" style={{ margin: "12px 0" }}>
            <button className="btn btn--primary btn--sm" disabled={!ready} onClick={() => download("zgf_brief_pmma.md", briefMarkdown(s, ranked, meta), "text/markdown")}>Markdown</button>
            <button className="btn btn--quiet btn--sm" disabled={!ready} onClick={printBrief}>Print or PDF</button>
            <button className="btn btn--quiet btn--sm" disabled={!ready} onClick={() => download("zgf_evidence_pmma.csv", briefCsv(s, ranked), "text/csv")}>CSV</button>
            <button className="btn btn--quiet btn--sm" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          </div>
          <hr className="rule" style={{ margin: "14px 0" }} />
          <h2>Sources of the three nearest</h2>
          <div className="nearest">{top.map((m) => <button key={m.id} onClick={() => openSource(m)}><span><b>{m.id}</b></span><span className="nearest__meta">{m.source.label}</span></button>)}</div>
          <hr className="rule" style={{ margin: "14px 0" }} />
          <p className="note">{cands.length} PMMA records in this build: {Array.from(new Set(cands.map((c) => c.record))).join(", ")}. Absence here is not absence in all NASA research.</p>
          <p className="note" style={{ marginTop: 8 }}>A solid sheet is out of the droplet model's reach; <a href={href("/model")}>Model Lab</a> shows that refusal.</p>
        </aside>
      </div>
      {ready && flexDoc.data && rep.data && <Planner pmma={cands} flex={flexDoc.data.train} fm2={rep.data.fm2.tests} datasetId={`ledger ${meta.ledger_head ?? "?"}; FLEX ${flexDoc.data.dataset_sha256.slice(0, 12)}`} />}
    </div>
  );
}
