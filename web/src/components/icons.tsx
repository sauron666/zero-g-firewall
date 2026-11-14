const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
type P = { size?: number };
const S = ({ size = 18, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base}>{children}</svg>
);
export const IconFan = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <path d="M12 10.2C12 6 13.5 3.5 16 4.2c2 .6 1.4 3.6-2.2 6.4M13.8 12c4.2 0 6.7 1.5 6 4-.6 2-3.6 1.4-6.4-2.2M12 13.8c0 4.2-1.5 6.7-4 6-2-.6-1.4-3.6 2.2-6.4M10.2 12C6 12 3.5 10.5 4.2 8c.6-2 3.6-1.4 6.4 2.2" />
  </S>
);
export const IconMenu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></S>;
export const IconPlay = (p: P) => <S {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></S>;
export const IconPause = (p: P) => <S {...p}><path d="M8 5.5v13M16 5.5v13" strokeWidth={2.6} /></S>;
export const IconReset = (p: P) => <S {...p}><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" /></S>;
export const IconReceipt = (p: P) => <S {...p}><path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5zM9 8h6M9 12h6" /></S>;
export const IconInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.6v.2" /></S>;
export const IconWarn = (p: P) => <S {...p}><path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.2" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const IconArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const IconTable = (p: P) => <S {...p}><path d="M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14" /></S>;
export const IconChip = (p: P) => <S {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5" /></S>;

/* Navigation: one mark per page, drawn in the same stroke as the rest. */
export const IconFlame = (p: P) => <S {...p}><circle cx="12" cy="13" r="6.5" /><circle cx="12" cy="13" r="2.4" fill="currentColor" stroke="none" /><path d="M12 3v2.2" /></S>;
export const IconSplit = (p: P) => <S {...p}><rect x="3.5" y="5" width="7" height="14" rx="1.5" /><rect x="13.5" y="5" width="7" height="14" rx="1.5" strokeDasharray="2.4 2.4" /></S>;
export const IconScales = (p: P) => <S {...p}><path d="M12 4v16M7 20h10M5 8h14M5 8l-2.2 5.5a2.6 2.6 0 0 0 4.4 0zM19 8l-2.2 5.5a2.6 2.6 0 0 0 4.4 0z" /></S>;
export const IconStack = (p: P) => <S {...p}><path d="M4 7.5 12 4l8 3.5-8 3.5zM4 12l8 3.5 8-3.5M4 16.5 12 20l8-3.5" /></S>;
export const IconRank = (p: P) => <S {...p}><path d="M5 19V9M12 19V5M19 19v-6" strokeWidth={2.6} /></S>;
export const IconMap = (p: P) => <S {...p}><path d="M4 19V5M4 19h16" /><circle cx="9" cy="14" r="1.4" fill="currentColor" stroke="none" /><circle cx="13" cy="9" r="1.4" fill="currentColor" stroke="none" /><circle cx="17.5" cy="12" r="1.4" /></S>;
export const IconGap = (p: P) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" /><path d="M12 8.5v4M12 15.6v.2" /></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>;
export const IconGauge = (p: P) => <S {...p}><path d="M4.5 16a8 8 0 1 1 15 0M12 13l3.5-4.5" /><circle cx="12" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></S>;
export const IconShield = (p: P) => <S {...p}><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6zM9 12l2.2 2.2L15.2 10" /></S>;
export const IconGrid = (p: P) => <S {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" fill="currentColor" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" fill="currentColor" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" strokeDasharray="2.2 2.2" /></S>;
export const IconAsk = (p: P) => <S {...p}><path d="M5 5.5h14v10H11l-4.5 3.5v-3.5H5z" /><path d="M9 9.5h6M9 12.3h3.5" /></S>;
export const IconRefute = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 15.5l7-7M8.5 8.5l7 7" /></S>;
export const IconChain = (p: P) => <S {...p}><rect x="3.5" y="8.5" width="9" height="7" rx="3.5" /><rect x="11.5" y="8.5" width="9" height="7" rx="3.5" /></S>;
export const IconData = (p: P) => <S {...p}><ellipse cx="12" cy="6.5" rx="7" ry="2.8" /><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="6.2" /><path d="M15.6 15.6 20 20" /></S>;
export const IconTour = (p: P) => <S {...p}><path d="M5 20V4.5M5 5h11l-2.2 3.5L16 12H5" /></S>;
