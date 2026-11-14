import { useMemo } from "react";
import { Kit } from "../lib/agent";
import { useData } from "../lib/data";
import { buildIndex } from "../lib/search";
import type { EnvelopeDoc, IndexDoc, MatrixDoc, RankDoc } from "../lib/types";

/** Everything the evidence agent reads, loaded once from the site's own files. Tools whose file is missing are simply not planned. */
export function useKit(ready: boolean): { kit: Kit | null; count: number; error: string | null } {
  const doc = useData<IndexDoc>(ready ? "index.json" : null);
  const envelope = useData<EnvelopeDoc>(ready ? "envelope.json" : null);
  const rank = useData<RankDoc>(ready ? "rank_features.json" : null);
  const matrix = useData<MatrixDoc>(ready ? "matrix.json" : null);
  const index = useMemo(() => (doc.data ? buildIndex(doc.data.chunks) : null), [doc.data]);
  const settled = !envelope.loading && !rank.loading && !matrix.loading;     // a question asked too early would silently skip a tool
  const kit = useMemo(() => (index && settled ? { index, envelope: envelope.data, rank: rank.data, matrix: matrix.data } : null), [index, settled, envelope.data, rank.data, matrix.data]);
  return { kit, count: doc.data?.count ?? 0, error: doc.error };
}
