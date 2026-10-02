import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Types `lines` out character by character with a blinking neon caret.
 * IMPORTANT: pass a constant `lines` array (define it outside the component).
 */
export default function NeonTypewriter({
  lines, startDelay = 400, speed = 45, lineDelay = 320, punctDelay = 140, onDone,
}){
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  // start offset of each line inside the flat text (+1 = the line break)
  const offsets = useMemo(() => {
    let o = 0;
    return lines.map((l) => {
      const start = o;
      o += l.length + 1;
      return start;
    });
  }, [lines]);

  useEffect(() => {
    const flat = lines.join('\n');
    let n = 0;
    let timer;
    const step = () => {
      n += 1;
      setCount(n);
      if (n >= flat.length) {
        doneRef.current?.();
        return;
      }
      const ch = flat[n - 1];
      let d = speed * (0.6 + Math.random() * 1.1);
      // if (ch === '\n') d += 320;
      // else if (ch === '.' || ch === ',') d += 140;
      if (ch === '\n') d += lineDelay;
      else if (ch === '.' || ch === ',') d += punctDelay;
      timer = setTimeout(step, d);
    };
    timer = setTimeout(step, startDelay);
    return () => clearTimeout(timer);
  }, [lines, speed, startDelay, lineDelay, punctDelay]);

  return (
    <div className="neon-block" aria-label={lines.join(' ')}>
      {lines.map((line, i) => {
        const start = offsets[i];
        const next = i === lines.length - 1 ? Infinity : offsets[i + 1];
        const typed = Math.min(Math.max(count - start, 0), line.length);
        const active = count >= start && count < next;
        return (
          <span className="neon-line" key={i} aria-hidden="true">
            {line.slice(0, typed)}
            {active && <span className="neon-cursor" />}
            <span className="neon-rest">{line.slice(typed)}</span>
          </span>
        );
      })}
    </div>
  );
}