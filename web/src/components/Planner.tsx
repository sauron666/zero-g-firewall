import { useMemo } from "react";
import { candidates, coverage, QUESTIONS, REGISTRY_VERSION } from "../lib/planner";
import type { Candidate } from "../lib/pmma";
import { TOL } from "../lib/pmma";
import { U } from "../lib/scenario";
import { KlassBadge } from "../lib/klass";
import { download } from "./LabTabs";

export function Planner({ pmma, flex, fm2, datasetId }: { pmma: Candidate[]; flex: { fuel: string; x_o2: number; p_kpa: number; x_co2: number; x_he: number }[]; fm2: { o2_pct: number; p_kpa: number }[]; datasetId: string }) {
  const cov = useMemo(() => coverage(QUESTIONS, pmma, flex), [pmma, flex]);
  const cands = useMemo(() => candidates(cov, fm2), [cov, fm2]);
  const open = cov.filter((c) => !c.covered);
  const exp = () => download("zgf_research_plan.json", JSON.stringify({ schema: "zgf-research-plan/1", registry_version: REGISTRY_VERSION, dataset: datasetId,
    method: `coverage gain = number of distinct unanswered questions whose every condition a hypothetical test would match (${TOL.o2.text}; ${TOL.p.text}; ${TOL.u.text}; ${TOL.g.text}); unweighted`,
    limits: ["candidates are hypothetical combinations: no NASA record, no outcome", "not expected information gain and not a NASA priority", "questions are this project's registry"],
    questions: cov.map((c) => ({ ids: c.dups, text: c.q.text, covered_by: c.by })), candidates: cands }, null, 1), "application/json");
  return (
    <section className="section stack" aria-label="Research planner">
      <div className="section__head"><h2 className="claim claim--m">{open.length} of {cov.length} distinct questions have no recorded test under all their conditions. Which test would close the most?</h2><KlassBadge k="derived" note="our method" /></div>
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="panel__head"><div><div className="panel__title">Question registry v{REGISTRY_VERSION}</div><div className="panel__sub">{QUESTIONS.length} questions asked, {cov.length} distinct after merging identical ones. This project's list, not NASA's.</div></div></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Question</th><th>Conditions</th><th>Recorded test</th></tr></thead><tbody>
            {cov.map((c) => <tr key={c.q.id}><td><b>{c.dups.join(" = ")}</b> {c.q.text}</td><td className="note">{c.q.material} {c.q.form}, {U.pct(c.q.o2)}, {U.kpa(c.q.p_kpa)}, {U.cms(c.q.u_m_s)}, {U.g(c.q.g)}</td><td>{c.by ? <span className="st st--match">{c.by}</span> : <span className="st st--not_reported">none</span>}</td></tr>)}
          </tbody></table></div>
        </div>
        <div className="panel" data-klass="illustrative">
          <div className="panel__head"><div><div className="panel__title">Hypothetical candidate tests</div><div className="panel__sub">Each is a combination of conditions, not a NASA record, and has no outcome. Coverage gain is an unweighted count.</div></div>
            <button className="btn btn--quiet btn--sm" onClick={exp}>Export the plan</button></div>
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            {cands.map((x) => (
              <div key={x.id} className="evcard">
                <div className="evcard__head"><div className="evcard__title">{x.id}: {x.conds.material} {x.conds.form}, {U.pct(x.conds.o2)}, {U.kpa(x.conds.p_kpa)}, {U.g(x.conds.g)}</div><span className="num"><b>gain {x.gain}</b></span></div>
                <div className="note">Would answer {x.answers.join(", ")}. {x.planned ?? "No planned NASA test in our sources overlaps it."}</div>
                <div className="note" style={{ marginTop: 4 }}>Unknown: {x.unknown.join("; ")}.</div>
              </div>
            ))}
          </div>
          <p className="note" style={{ marginTop: 10 }}>Why no single candidate answers everything: a PMMA sheet at lunar gravity says nothing about a heptane droplet in free fall, and a free-fall test does not match a lunar question. Each open question needs its own combination; merging the two asks of the lunar question keeps it from counting twice.</p>
        </div>
      </div>
    </section>
  );
}
