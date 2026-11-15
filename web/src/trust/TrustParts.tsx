/** Parts of the Alarm Trust page added on 15 November: frame inspector, the two axes, policy, receiver comparison, trust zones. */
import { useMemo, useState } from "react";
import { Checked, CompareRow, Delivery, Receiver, SENSORS, SENSOR_IDS, SensorId, Verdict } from "./lab";
import { DEFAULT_POLICY, OPS } from "./policy";
import { KlassBadge } from "../lib/klass";

export function Axes({ v, out, dropAt }: { v: Verdict; out: Delivery; dropAt: number | null }) {
  const on = (id: string) => v.signals.find((s) => s.id === id)?.on;
  const phys = [["smoke", "smoke"], ["co", "carbon monoxide"], ["temp", "heat"]].filter(([id]) => on(id)).map(([, l]) => l);
  const i = v.integrity;
  return (
    <div className="axes2" role="group" aria-label="Physical evidence and data integrity, judged apart">
      <div>
        <h3>Physical evidence (accepted frames only)</h3>
        <div className="big">{v.state === "FIRE ALARM" ? "Fire alarm, latched" : phys.length ? `Signs: ${phys.join(", ")}` : "No physical sign"}</div>
        <p className="note" style={{ marginTop: 6 }}>Best fit: {v.leading}. Policy in force: v{v.policy}.</p>
      </div>
      <div>
        <h3>Data integrity</h3>
        <div className="big">{i.anomaly ? "Anomaly" : "Every frame checks out"}</div>
        <p className="note" style={{ marginTop: 6 }}>{i.badSig} bad signature · {i.replays + i.gaps} sequence · {i.skewed} clock · {i.stale.length} silent feed · policy {i.policy ? "changed in memory" : "as pinned"}. An integrity anomaly can raise an alert; it never lowers a fire alarm.</p>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <h3>Alarm output to the crew (simulated annunciator)</h3>
        <div className="big">{out.status === "none" ? "Nothing sent" : out.status === "delivered" ? `Delivered at ${out.sentAt} s, acknowledged at ${out.ackAt} s` : out.status === "awaiting" ? `Sent at ${out.sentAt} s, waiting for acknowledgement` : `Sent at ${out.sentAt} s, NOT acknowledged: supervisory anomaly`}</div>
        <p className="note" style={{ marginTop: 6 }}>{dropAt != null ? `In this scenario the output channel drops messages from ${dropAt} s. ` : ""}Deciding FIRE ALARM and delivering it are separate facts; the page never merges them.</p>
      </div>
    </div>
  );
}

export function Inspector({ checked, at }: { checked: Checked[]; at: number }) {
  const [sid, setSid] = useState<SensorId>("smoke_duct");
  const t0 = checked.length ? Math.min(...checked.map((f) => f.rx)) : 0;
  const te0 = checked.length ? Math.min(...checked.map((f) => f.t)) : 0;
  const mine = useMemo(() => checked.filter((f) => f.sid === sid && (f.rx - t0) / 1000 <= at), [checked, sid, at, t0]);
  const firstBad = mine.findIndex((f) => !f.ok);
  const [pick, setPick] = useState<number | null>(null);
  const idx = pick != null && pick < mine.length ? pick : firstBad >= 0 ? firstBad : mine.length - 1;
  const f = mine[idx];
  const original = f && f.note === "replayed" ? checked.find((x) => x.sid === f.sid && x.seq === f.seq && x.ok) : null;
  const s = SENSORS[sid];
  return (
    <section className="panel" data-klass="synthetic" aria-label="Frame inspector">
      <div className="panel__head"><div><h2 className="panel__title">Frame inspector</h2><p className="panel__sub">Every frame the receiver got from one sensor, in arrival order. Green: accepted. Red: rejected. Striped: a replayed copy.</p></div><KlassBadge k="synthetic" /></div>
      <div className="seg" role="group" aria-label="Sensor" style={{ marginBottom: 10, flexWrap: "wrap" }}>{SENSOR_IDS.map((x) => <button key={x} type="button" aria-pressed={x === sid} onClick={() => { setSid(x); setPick(null); }}>{SENSORS[x].name.replace(", return-duct detector", " (duct)").replace(", overhead detector", " (overhead)")}</button>)}</div>
      <div className="frames" aria-hidden="true">
        {mine.map((x, i) => <span key={i} data-ok={String(x.ok)} data-note={x.note ?? ""} data-on={String(i === idx)} title={`seq ${x.seq}, ${x.ok ? "accepted" : x.why[0]}`} onClick={() => setPick(i)} />)}
      </div>
      <div className="frames-nav">
        <button type="button" className="btn btn--quiet btn--sm" disabled={idx <= 0} onClick={() => setPick(Math.max(0, idx - 1))}>Previous frame</button>
        <input type="range" min={0} max={Math.max(0, mine.length - 1)} value={Math.max(0, idx)} onChange={(e) => setPick(+e.target.value)} aria-label={`Frame of ${s.name}, ${idx + 1} of ${mine.length}`} />
        <button type="button" className="btn btn--quiet btn--sm" disabled={idx >= mine.length - 1} onClick={() => setPick(Math.min(mine.length - 1, idx + 1))}>Next frame</button>
        <button type="button" className="btn btn--quiet btn--sm" disabled={firstBad < 0} onClick={() => setPick(firstBad)}>First rejected</button>
        <span className="note num">frame {idx + 1} of {mine.length}</span>
      </div>
      {f ? (
        <div className="inspector" style={{ marginTop: 12 }}>
          <dl>
            <dt>sensor</dt><dd>{s.name} <span className="mono">({f.sid})</span></dd>
            <dt>value</dt><dd>{f.v.toFixed(4)} {s.unit}</dd>
            <dt>sequence</dt><dd className="mono">{f.seq}</dd>
            <dt>event time t</dt><dd className="mono">{((f.t - te0) / 1000).toFixed(1)} s on the sensor clock</dd>
            <dt>received rx</dt><dd className="mono">{((f.rx - t0) / 1000).toFixed(1)} s ({((f.rx - f.t) / 1000).toFixed(1)} s after t)</dd>
            <dt>key ID</dt><dd className="mono">{f.kid}</dd>
            <dt>signature</dt><dd className={f.sigOk ? "ok-t" : "bad-t"}>{f.sigOk ? "verifies over the canonical bytes" : "does not verify"} <span className="mono note">{f.sig.slice(0, 16)}…</span></dd>
            <dt>freshness</dt><dd className={f.fresh ? "ok-t" : "bad-t"}>{f.fresh ? "within 5 s of receipt" : "stale or from the wrong time"}</dd>
            <dt>order, duplicate</dt><dd className={f.seqOk ? "ok-t" : "bad-t"}>{f.seqOk ? "next in sequence, first seen" : "out of order or seen before"}</dd>
            <dt>decision</dt><dd className={f.ok ? "ok-t" : "bad-t"}>{f.ok ? "accepted and used" : "rejected, not used"}</dd>
            <dt>why</dt><dd>{f.why.length ? f.why.join("; ") : "all checks hold"}</dd>
          </dl>
          {original && <p className="note" style={{ marginTop: 10 }}>This is a copy of sequence {original.seq}, first received at {((original.rx - t0) / 1000).toFixed(1)} s and accepted then. The signature still verifies: it proves the bytes were signed by the sensor, not that they are new.</p>}
          {f.note === "clock shifted" && <p className="note" style={{ marginTop: 10 }}>Signed with the right key and the wrong clock: the sensor itself is compromised. Freshness, not the signature, catches it.</p>}
        </div>
      ) : <p className="note">No frame from this sensor yet.</p>}
    </section>
  );
}

export function PolicyPanel({ hash }: { hash: string }) {
  return (
    <section className="panel" data-klass="synthetic">
      <div className="panel__head"><div><h2 className="panel__title">The rules the receiver executes: {DEFAULT_POLICY.id} v{DEFAULT_POLICY.version}</h2><p className="panel__sub">Readable data with a schema: the receiver accepts {Object.keys(OPS).length} rule types and their numbers, never code. SHA-256 of the canonical JSON: <span className="mono">{hash ? hash.slice(0, 24) + "…" : "computing"}</span></p></div>
        <button className="btn btn--quiet btn--sm" onClick={() => { const u = URL.createObjectURL(new Blob([JSON.stringify(DEFAULT_POLICY, null, 1)], { type: "application/json" })); const a = document.createElement("a"); a.href = u; a.download = `zgf_alarm_policy_${DEFAULT_POLICY.version}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }}>Policy JSON</button></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Rule</th><th>Type</th><th className="r">Threshold</th><th className="r">Window</th><th>Severity</th><th>Basis and limit</th></tr></thead><tbody>
        {DEFAULT_POLICY.rules.map((r) => <tr key={r.id}><td className="mono">{r.id}</td><td title={OPS[r.op]}>{r.op.replace(/_/g, " ")}</td><td className="r num">{r.threshold} {r.unit}</td><td className="r num">{r.window} {r.window_unit}</td><td>{r.severity}</td><td className="note">{r.evidence}. {r.limitations}.</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

const RCV: [Receiver, string][] = [["single_threshold", "Single threshold"], ["corroboration", "Corroboration, no checks"], ["integrity_aware", "Integrity-aware (this lab)"]];
export function Comparison({ rows }: { rows: CompareRow[] }) {
  const totals = (r: Receiver) => {
    let fn = 0, fp = 0, fire = 0, nonfire = 0;
    for (const x of rows) { const o = x.out[r]; if (x.scenario.fire) { fire += x.runs; fn += x.runs - o.fire; } else { nonfire += x.runs; fp += o.fire; } }
    return { fn, fp, fire, nonfire };
  };
  return (
    <>
      <div className="metric-grid" style={{ marginTop: 8 }}>
        {RCV.map(([id, l]) => { const t = totals(id); return <div key={id}><div className="stat__label">{l}</div><div className="stat__value num">{t.fn}<small>of {t.fire} fires missed</small></div><div className="stat__note">{t.fp} false fire alarms in {t.nonfire} runs without fire</div></div>; })}
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}><table className="table">
        <thead><tr><th>Situation</th><th>Truth</th><th className="r">Runs</th>{RCV.map(([id, l]) => <th key={id} className="r">{l}: fire / alert / clear</th>)}<th className="r">Integrity anomaly flagged</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.scenario.id}><td>{x.scenario.name}</td><td className="note">{x.scenario.truth}</td><td className="r num">{x.runs}</td>
          {RCV.map(([id]) => { const o = x.out[id]; const bad = x.scenario.fire ? o.fire < x.runs : o.fire > 0; return <td key={id} className={`r num ${bad ? "bad-t" : ""}`}>{o.fire} / {o.alert} / {o.clear}</td>; })}
          <td className="r num">{x.out.integrity_aware.anomaly} of {x.runs}</td></tr>)}</tbody>
      </table></div>
      <p className="note" style={{ marginTop: 6 }}>Red: a missed fire or a false fire alarm. All three receivers read the same frames from the same seeds, under the same physical rules; each differs from the next by one kind of check. When every sensor is replayed, no receiver has evidence of the fire: the lab flags it as unknown rather than clear. Synthetic results: they do not validate anything for flight.</p>
    </>
  );
}

/** E14: where each boundary sits, what it protects and what stays trusted. */
export function TrustZones() {
  const Z = [
    ["Sensor", "measures and signs", "trusted: its key and its clock (the clock-shift scenario breaks this)"],
    ["Transport (data bus)", "carries frames", "untrusted: forged, replayed or dropped frames are expected"],
    ["Verifier", "signature, sequence, freshness, silence", "protects against forgery, replay, stale and missing frames"],
    ["Decision", "physical rules of a pinned policy", "protects against a changed policy; trusts the rules themselves"],
    ["Output (simulated)", "annunciator with acknowledgement", "protects against a silently dropped alarm; controls nothing real"],
  ];
  return (
    <section className="panel" data-klass="illustrative" aria-label="Trust zones">
      <div className="panel__head"><div><h2 className="panel__title">Trust zones of this lab</h2><p className="panel__sub">A diagram of the synthetic receiver. Not a description of any spacecraft and no security certification.</p></div><KlassBadge k="illustrative" /></div>
      <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, listStyle: "none", padding: 0 }}>
        {Z.map(([n, does, trust], i) => (
          <li key={n} style={{ border: "1px solid var(--hairline)", borderRadius: 5, padding: 12, position: "relative", background: i === 1 ? "repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in srgb, var(--critical) 8%, transparent) 8px 16px)" : "var(--surface)" }}>
            <div className="mono note">{i + 1}</div>
            <div style={{ fontWeight: 700 }}>{n}</div>
            <div className="note" style={{ marginTop: 4 }}>{does}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{trust}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
