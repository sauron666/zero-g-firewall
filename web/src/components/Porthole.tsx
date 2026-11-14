/** A chamber window: flames are filmed in the dark, through round ports, against a scale. */
export function Porthole({ children, tag }: { children: React.ReactNode; tag?: string }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  return (
    <div className="porthole">
      {children}
      <svg className="porthole__ticks" viewBox="0 0 200 200" aria-hidden="true">
        {ticks.map((i) => {
          const a = (i / 72) * Math.PI * 2;
          const major = i % 6 === 0;
          const r1 = 96, r0 = major ? 89 : 92.5;
          return (
            <line key={i} x1={100 + Math.cos(a) * r0} y1={100 + Math.sin(a) * r0} x2={100 + Math.cos(a) * r1} y2={100 + Math.sin(a) * r1}
              stroke="currentColor" strokeWidth={major ? 1 : 0.6} />
          );
        })}
      </svg>
      {tag && <div className="porthole__tag">{tag}</div>}
    </div>
  );
}
