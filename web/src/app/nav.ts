/** One table drives the rail, the routes and the judge tour. */
export interface NavItem {
  path: string;
  label: string;
  /** which artifact the page needs before it has anything to show */
  needs?: "nasa";
}
export interface NavGroup {
  name: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    name: "The question",
    items: [
      { path: "/", label: "Kill the fans?" },
      { path: "/paradox", label: "Two realities" },
      { path: "/myths", label: "Myths and evidence", needs: "nasa" },
    ],
  },
  {
    name: "Evidence",
    items: [
      { path: "/evidence", label: "Investigations", needs: "nasa" },
      { path: "/rank", label: "Rank for a mission", needs: "nasa" },
      { path: "/envelope", label: "Atmosphere map", needs: "nasa" },
      { path: "/gaps", label: "Gaps and plans", needs: "nasa" },
      { path: "/lessons", label: "Incidents and Earth uses", needs: "nasa" },
    ],
  },
  {
    name: "Physics",
    items: [{ path: "/physics", label: "Flame physics" }],
  },
  {
    name: "Alarm trust",
    items: [
      { path: "/alarm", label: "Alarm trust lab" },
      { path: "/playbooks", label: "Fire matrix and playbook", needs: "nasa" },
    ],
  },
  {
    name: "Assurance",
    items: [
      { path: "/ask", label: "Ask the evidence" },
      { path: "/falsify", label: "Try to refute it" },
      { path: "/ledger", label: "Evidence ledger", needs: "nasa" },
      { path: "/data", label: "Data and models", needs: "nasa" },
      { path: "/about", label: "Method and limits" },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
