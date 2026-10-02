import * as THREE from 'three';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Procedural placeholder texture used only if mars.glb / moon.glb can't be loaded. */
export function makePlanetTexture(kind) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const r = rng(kind === 'mars' ? 7 : 11);

  // soft blob, drawn 3x so it wraps around the seam
  const blob = (x, y, rad, rgb, a) => {
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
    }
  };

  if (kind === 'mars') {
    ctx.fillStyle = '#a2512c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) blob(r() * W, r() * H, 40 + r() * 120, '84,38,20', 0.25 + r() * 0.25);
    for (let i = 0; i < 60; i++) blob(r() * W, r() * H, 30 + r() * 100, '214,140,86', 0.18 + r() * 0.2);
    for (let i = 0; i < 40; i++) blob(r() * W, H * 0.25 + r() * H * 0.5, 12 + r() * 30, '60,26,14', 0.35);
    const cap = (y0, y1) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(245,240,235,0.95)');
      g.addColorStop(1, 'rgba(245,240,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
    };
    cap(0, H * 0.08);
    cap(H, H * 0.93);
  } else {
    ctx.fillStyle = '#8a8a8c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) blob(r() * W, r() * H, 50 + r() * 120, '172,172,174', 0.2);
    for (let i = 0; i < 14; i++) blob(r() * W, r() * H, 60 + r() * 110, '66,66,70', 0.35);
    for (let i = 0; i < 380; i++) {
      const rad = 2 + Math.pow(r(), 3) * 26;
      const x = r() * W, y = r() * H;
      blob(x, y, rad, '40,40,44', 0.35);
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(214,214,216,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}