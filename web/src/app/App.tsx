import { useEffect, useState } from "react";
import { NAV, ALL_ITEMS } from "./nav";
import { href, useRoute } from "./router";
import { Manifest, fmtUtc, useData } from "../lib/data";
import { ReceiptProvider } from "../components/Receipt";
import { IconClose, IconMenu, IconMoon, IconSun } from "../components/icons";
import { Home } from "../pages/Home";
import { Paradox } from "../pages/Paradox";
import { Physics } from "../pages/Physics";
import { About } from "../pages/About";
import { Pending } from "../pages/Pending";
import { PageProps } from "../pages/stubs";
import { Evidence } from "../pages/Evidence";
import { Rank } from "../pages/Rank";
import { Envelope } from "../pages/Envelope";
import { Gaps } from "../pages/Gaps";
import { Myths } from "../pages/Myths";
import { Lessons } from "../pages/Lessons";
import { Ledger } from "../pages/Ledger";
import { DataModels } from "../pages/DataModels";
import { Playbooks } from "../pages/Playbooks";
import { Alarm } from "../pages/Alarm";
import { Ask } from "../pages/Ask";
import { Falsify } from "../pages/Falsify";

/** Every route is registered here once. To build a page, edit its file in ../pages; this table does not change. */
const PAGES: Record<string, (p: PageProps) => React.ReactNode> = {
  "/evidence": Evidence, "/rank": Rank, "/envelope": Envelope, "/gaps": Gaps, "/myths": Myths, "/lessons": Lessons,
  "/ledger": Ledger, "/data": DataModels, "/playbooks": Playbooks, "/alarm": Alarm, "/ask": Ask, "/falsify": Falsify,
};

type Theme = "dark" | "light";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("zgf.theme");
    if (t === "dark" || t === "light") return t;
  } catch { /* storage may be blocked */ }
  return (document.documentElement.dataset.theme as Theme) || "dark";
}

function Mark() {
  return (
    <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#04070d" stroke="var(--axis)" strokeWidth="2" />
      <circle cx="32" cy="34" r="14" fill="#3987e5" opacity="0.55" />
      <circle cx="32" cy="35" r="9" fill="#3987e5" />
      <circle cx="32" cy="36.5" r="4.6" fill="#d6e6ff" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={32 + Math.cos(a) * 25} y1={32 + Math.sin(a) * 25} x2={32 + Math.cos(a) * 28.5} y2={32 + Math.sin(a) * 28.5} stroke="#8792aa" strokeWidth="1.2" />;
      })}
    </svg>
  );
}

export function App() {
  const route = useRoute();
  const manifest = useData<Manifest>("manifest.json");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);
  const nasa = manifest.data?.nasa ?? null;
  const brand = manifest.data?.brand ?? "Zero-G Firewall";
  const team = manifest.data?.team ?? "The Rule of Flame";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("zgf.theme", theme); } catch { /* ignore */ }
  }, [theme]);
  useEffect(() => setOpen(false), [route.path]);

  const top = "/" + (route.segs[0] ?? "");
  const current = ALL_ITEMS.find((i) => i.path === top);
  let page: React.ReactNode;
  switch (top) {
    case "/": page = <Home manifest={manifest.data} />; break;
    case "/paradox": page = <Paradox />; break;
    case "/physics": page = <Physics />; break;
    case "/about": page = <About manifest={manifest.data} />; break;
    default: {
      const P = PAGES[top];
      page = P ? <P route={route} manifest={manifest.data} /> : <Pending item={current} nasaReady={!!nasa} />;
    }
  }

  return (
    <ReceiptProvider>
      <div className="shell">
        <nav className="rail" data-open={open} aria-label="Sections">
          <a className="brand" href={href("/")}>
            <Mark />
            <span>
              <span className="brand__name">{brand}</span>
              <br />
              <span className="brand__sub">{team}</span>
            </span>
          </a>
          {NAV.map((g) => (
            <div className="nav-group" key={g.name}>
              <div className="nav-group__name">{g.name}</div>
              <ul>
                {g.items.map((it) => (
                  <li key={it.path}>
                    <a className="nav-link" href={href(it.path)} aria-current={it.path === top ? "page" : undefined}>
                      <span>{it.label}</span>
                      {it.needs === "nasa" && !nasa && <span className="nav-link__state">after sync</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rail__foot">
            NASA Space Apps Challenge 2026, Sofia.
            <br />
            Independent project, not endorsed by NASA.
          </div>
        </nav>
        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>
              {open ? <IconClose /> : <IconMenu />}
            </button>
            <span className="label">{current?.label ?? "Zero-G Firewall"}</span>
            <span className="topbar__spacer" />
            <a className="chip chip--wide" href={href("/ledger")} title="Where the data came from">
              <span className={`dot ${nasa ? "dot--ok" : "dot--off"}`} />
              {nasa ? `NASA data synced ${fmtUtc(nasa.synced_at_utc)}` : "NASA data: waiting for sync"}
            </a>
            <a className="chip chip--wide" href={href("/ask")} title="How answers are produced">
              <span className="dot dot--ok" />
              Evidence engine: offline
            </a>
            <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}>
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </header>
          <main className="main" id="main">{page}</main>
        </div>
      </div>
    </ReceiptProvider>
  );
}
