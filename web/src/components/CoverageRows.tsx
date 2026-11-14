import { href } from "../app/router";
import type { Coverage, Habitat, MatrixDoc } from "../lib/types";

const ORDER: Coverage[] = ["evidence", "bounded", "gap", "na"];
const WORD: Record<Coverage, string> = { evidence: "measured there", bounded: "bounded by a model or a related test", gap: "nothing measured", na: "does not apply" };

/** The fire behaviour matrix in two rows of marks: what is measured in free fall, and what is left of it in lunar gravity. */
export function CoverageRows({ mx }: { mx: MatrixDoc }) {
  const row = (h: Habitat, label: string, about: string) => {
    const cells = [...mx.cells].sort((a, b) => ORDER.indexOf(a[h]) - ORDER.indexOf(b[h]));
    return (
      <div className={`covrow mx__hab--${h}`}>
        <div className="covrow__name"><b>{label}</b><span>{about}</span></div>
        <div className="covrow__marks" role="img" aria-label={`${label}: ${mx.coverage[h].evidence} of ${mx.cells.length} behaviours measured, ${mx.coverage[h].bounded} bounded, ${mx.coverage[h].gap} with nothing measured`}>
          {cells.map((c) => <a key={c.id} href={href(`/playbooks/${c.id}`)} className={`cmark cmark--${c[h]}`} title={`${c.name}: ${WORD[c[h]]}`} aria-hidden="true" tabIndex={-1} />)}
        </div>
        <div className="covrow__num"><b>{mx.coverage[h].evidence}</b><span>of {mx.cells.length} measured</span></div>
      </div>
    );
  };
  return (
    <div className="covrows">
      {row("iss", "Space station", "free fall")}
      {row("lunar", "Lunar habitat", "one sixth of Earth gravity")}
    </div>
  );
}
