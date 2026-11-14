import * as I from "./icons";

const MAP: Record<string, (p: { size?: number }) => React.ReactNode> = {
  Flame: I.IconFlame, Split: I.IconSplit, Scales: I.IconScales, Stack: I.IconStack, Rank: I.IconRank, Map: I.IconMap, Gap: I.IconGap, Clock: I.IconClock,
  Gauge: I.IconGauge, Shield: I.IconShield, Grid: I.IconGrid, Ask: I.IconAsk, Refute: I.IconRefute, Chain: I.IconChain, Data: I.IconData, Info: I.IconInfo,
};
export function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  const C = MAP[name] ?? I.IconInfo;
  return <C size={size} />;
}
