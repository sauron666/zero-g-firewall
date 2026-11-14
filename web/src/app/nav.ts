/** One table drives the rail, the routes and the judge tour. */
export interface NavItem {
  path: string;
  label: string;
  /** name of the mark in components/icons.tsx */
  icon: string;
  /** one line for the quick search and the opening page */
  about: string;
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
      { path: "/", label: "Kill the fans?", icon: "Flame", about: "The question, the two flames and where to go next" },
      { path: "/paradox", label: "Two realities", icon: "Split", about: "The same cabin and fire, with the fans on and with the fans off" },
      { path: "/myths", label: "Myths and evidence", icon: "Scales", about: "NASA's three misconceptions, with both sides of each", needs: "nasa" },
    ],
  },
  {
    name: "Evidence",
    items: [
      { path: "/evidence", label: "Investigations", icon: "Stack", about: "Every combustion record in NASA's repository, with its table", needs: "nasa" },
      { path: "/rank", label: "Rank for a mission", icon: "Rank", about: "Which records matter for a station, a lunar habitat, a rover or a suit", needs: "nasa" },
      { path: "/envelope", label: "Atmosphere map", icon: "Map", about: "Every test by oxygen and pressure, and where nobody has tested", needs: "nasa" },
      { path: "/gaps", label: "Gaps and plans", icon: "Gap", about: "What has not been measured, and what NASA plans", needs: "nasa" },
      { path: "/lessons", label: "Incidents and Earth uses", icon: "Clock", about: "Apollo 1, Apollo 13, Mir, and what reached firefighters", needs: "nasa" },
    ],
  },
  {
    name: "Physics",
    items: [{ path: "/physics", label: "Flame physics", icon: "Gauge", about: "Scaling with gravity, and the flame model checked against NASA's numbers" }],
  },
  {
    name: "Alarm trust",
    items: [
      { path: "/alarm", label: "Alarm trust lab", icon: "Shield", about: "Is the alarm real: smoke, dust, a failing sensor or tampered data" },
      { path: "/playbooks", label: "Fire matrix and playbook", icon: "Grid", about: "Fire behaviours by phase, what is measured, and the documented response", needs: "nasa" },
    ],
  },
  {
    name: "Assurance",
    items: [
      { path: "/ask", label: "Ask the evidence", icon: "Ask", about: "An agent answers from NASA's tables and documents, with sources and a trace" },
      { path: "/falsify", label: "Try to refute it", icon: "Refute", about: "Six conclusions of this site, each attacked with NASA's own evidence" },
      { path: "/ledger", label: "Evidence ledger", icon: "Chain", about: "Every file fetched from NASA, hash-chained and verified in your browser", needs: "nasa" },
      { path: "/data", label: "Data and models", icon: "Data", about: "Curator report, tidy downloads and the model check", needs: "nasa" },
      { path: "/about", label: "Method and limits", icon: "Info", about: "How the site works, what it does not claim, and how AI was used" },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
