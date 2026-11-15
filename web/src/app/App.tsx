import { useEffect, useRef, useState } from "react";
import { NAV, ALL_ITEMS } from "./nav";
import { href, useRoute } from "./router";
import { Manifest, fmtUtc, useData } from "../lib/data";
import { ReceiptProvider } from "../components/Receipt";
import { loadSettings, MODE_LABEL, onSettings } from "../lib/ai";
import { IconClose, IconMenu, IconMoon, IconSearch, IconSun } from "../components/icons";
import { NavIcon } from "../components/NavIcon";
import { Palette } from "../components/Palette";
import { useIskra } from "../mascot/Iskra";
import { IskraChat } from "../mascot/Chat";
import { Tour } from "../mascot/Tour";
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
import { FireLab } from "../pages/FireLab";
import { Material } from "../pages/Material";
import { ModelLab } from "../pages/ModelLab";
import { keepScrollersReachable } from "../lib/reach";

/** Every route is registered here once. To build a page, edit its file in ../pages; this table does not change. */
const PAGES: Record<string, (p: PageProps) => React.ReactNode> = {
  "/evidence": Evidence, "/rank": Rank, "/envelope": Envelope, "/gaps": Gaps, "/myths": Myths, "/lessons": Lessons,
  "/ledger": Ledger, "/data": DataModels, "/playbooks": Playbooks, "/alarm": Alarm, "/ask": Ask, "/falsify": Falsify,
  "/lab": FireLab, "/material": Material, "/model": ModelLab,
};

const ENGINE: Record<string, string> = { offline: "built in, works offline", browser: "model in this browser", local: "local model", cloud: "cloud model", hybrid: "local and cloud" };

/** Universal time, ticking: the one live reading on the bar. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => keepScrollersReachable(), []);                                    // a box that scrolls can be reached from the keyboard
  return <span className="clock" title="Coordinated Universal Time">UTC <b>{now.toISOString().slice(11, 19)}</b></span>;
}

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
  const [search, setSearch] = useState(false);
  const [aiMode, setAiMode] = useState(() => loadSettings().mode);
  useEffect(() => {                       // Ctrl or Command with K anywhere; a bare slash when nothing is being typed
    const on = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearch((v) => !v); }
      else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => onSettings(() => setAiMode(loadSettings().mode)), []);
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
  const iskra = useIskra(top);
  const mascot = manifest.data?.mascot ?? "ISKRA";
  const [tour, setTour] = useState<number | null>(null);
  const toured = useRef(false);
  useEffect(() => {                       // a link with tour=1 starts the tour once
    if (route.query.get("tour") === "1" && !toured.current) { toured.current = true; setTour(0); }
  }, [route]);
  const startTour = () => { toured.current = true; setTour(0); };
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
      <div className={`shell ${tour != null ? "tour-on" : ""}`}>
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
            <div className={`nav-group ${g.technical ? "nav-group--tech" : ""}`} key={g.name}>
              <div className="nav-group__name">{g.name}</div>
              <ul>
                {g.items.map((it) => (
                  <li key={it.path}>
                    <a className="nav-link" href={href(it.path)} aria-current={it.path === top ? "page" : undefined}>
                      <span className="nav-link__main"><NavIcon name={it.icon} /><span>{it.label}</span></span>
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
            <button type="button" className="searchbtn" onClick={() => setSearch(true)} aria-label="Quick search"><IconSearch size={16} /><span>Search or ask</span><kbd>Ctrl K</kbd></button>
            <a className="chip chip--wide" href={href("/ledger")} title="Where the data came from">
              <span className={`dot ${nasa ? "dot--ok" : "dot--off"}`} />
              {nasa ? `NASA data synced ${fmtUtc(nasa.synced_at_utc)}` : "NASA data: waiting for sync"}
            </a>
            <a className="chip chip--wide chip--engine" href={href("/ask")} title="How answers are written">
              <span className="dot dot--ok" />
              {mascot}: {ENGINE[aiMode] ?? MODE_LABEL[aiMode]}
            </a>
            <Clock />
            <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}>
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </header>
          <main className="main" id="main">{page}</main>
        </div>
      </div>
      <Palette open={search} onClose={() => setSearch(false)} ready={!!nasa} />
      {tour != null && <Tour at={tour} set={setTour} manifest={manifest.data} state={iskra} />}
      <IskraChat state={iskra} name={mascot} top={top} ready={!!nasa} onTour={startTour} touring={tour != null} />
    </ReceiptProvider>
  );
}
