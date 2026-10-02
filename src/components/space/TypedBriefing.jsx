import { useEffect, useMemo, useState } from 'react';

const CHUNK = 3;  // characters per tick
const TICK = 11;  // ms per tick (intro text: ~50 ms per single character)

/** Mission-briefing panel content, typed out quickly, character by character. */
export default function TypedBriefing({ data, active = true }) {
  const segs = useMemo(
    () => [
      data.title,
      ...data.stats.map((s) => s.value),
      ...data.sections.flatMap((s) => [s.heading, s.body]),
    ],
    [data]
  );
  const offsets = useMemo(() => {
    let o = 0;
    return segs.map((t) => {
      const start = o;
      o += t.length + 1;
      return start;
    });
  }, [segs]);
  const total = offsets[offsets.length - 1] + segs[segs.length - 1].length;

  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let n = 0;
    let timer;
    const step = () => {
      n = Math.min(n + CHUNK, total);
      setCount(n);
      if (n >= total) return;
      timer = setTimeout(step, TICK * (0.7 + Math.random() * 0.8));
    };
    timer = setTimeout(step, 200);
    return () => clearTimeout(timer);
  }, [active, total]);

  const seg = (i) => {
    const text = segs[i];
    const next = i === segs.length - 1 ? Infinity : offsets[i + 1];
    const typed = Math.min(Math.max(count - offsets[i], 0), text.length);
    const isActive = active && count >= offsets[i] && count < next;
    return (
      <>
        {text.slice(0, typed)}
        {isActive && <span className="neon-cursor" />}
        <span className="brief-rest">{text.slice(typed)}</span>
      </>
    );
  };

  return (
    <div className="brief">
      <div className="brief-eyebrow">{data.eyebrow}</div>
      <h2 className="brief-title">{seg(0)}</h2>
      <div className="brief-type">{data.type}</div>

      <div className="brief-stats">
        {data.stats.map((s, i) => (
          <div className="brief-stat" key={s.label}>
            <span className="brief-stat-label">{s.label}</span>
            <span className="brief-stat-value">{seg(1 + i)}</span>
          </div>
        ))}
      </div>

      {data.sections.map((s, i) => {
        const base = 1 + data.stats.length + i * 2;
        return (
          <section className="brief-section" key={s.heading}>
            <h3>{seg(base)}</h3>
            <p>{seg(base + 1)}</p>
          </section>
        );
      })}
    </div>
  );
}