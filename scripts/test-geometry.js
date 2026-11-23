'use strict';

// 纯逻辑验证：复刻 edgeController._computeBounds 的几何规则，检查四个方向的坐标。
// 不依赖 Electron/GUI，可在 node 下直接跑。

function computeBounds(cfg, display, hidden) {
  const wa = display.workArea;
  const W = Number(cfg.windowWidth);
  const H = Number(cfg.windowHeight);
  const reveal = Math.max(2, Number(cfg.revealPx));
  let x, y;
  switch (cfg.edge) {
    case 'left':
      x = hidden ? wa.x - (W - reveal) : wa.x;
      y = wa.y + (wa.height - H) / 2;
      break;
    case 'top':
      x = wa.x + (wa.width - W) / 2;
      y = hidden ? wa.y - (H - reveal) : wa.y;
      break;
    case 'bottom':
      x = wa.x + (wa.width - W) / 2;
      y = hidden ? wa.y + wa.height - reveal : wa.y + wa.height - H;
      break;
    case 'right':
    default:
      x = hidden ? wa.x + wa.width - reveal : wa.x + wa.width - W;
      y = wa.y + (wa.height - H) / 2;
      break;
  }
  return { x: Math.round(x), y: Math.round(y), width: W, height: H };
}

const display = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const base = { windowWidth: 460, windowHeight: 760, revealPx: 6 };

const cases = [
  { edge: 'right', hiddenX: 1914, visibleX: 1460, hiddenY: 140, visibleY: 140 },
  { edge: 'left',  hiddenX: -454, visibleX: 0,    hiddenY: 140, visibleY: 140 },
  { edge: 'top',   hiddenX: 730,  visibleX: 730,  hiddenY: -754, visibleY: 0 },
  { edge: 'bottom',hiddenX: 730,  visibleX: 730,  hiddenY: 1034, visibleY: 280 }
];

let failed = 0;
for (const c of cases) {
  const cfg = { ...base, edge: c.edge };
  const h = computeBounds(cfg, display, true);
  const v = computeBounds(cfg, display, false);
  const ok = h.x === c.hiddenX && h.y === c.hiddenY && v.x === c.visibleX && v.y === c.visibleY;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.edge.padEnd(6)} hidden=(${h.x},${h.y}) visible=(${v.x},${v.y})`);
  if (!ok) failed++;
}

// 校验：隐藏态只露出 revealPx
for (const c of cases) {
  const cfg = { ...base, edge: c.edge };
  const h = computeBounds(cfg, display, true);
  const wa = display.workArea;
  let exposed;
  if (c.edge === 'right') exposed = wa.x + wa.width - h.x;
  if (c.edge === 'left') exposed = h.x + h.width - wa.x;
  if (c.edge === 'top') exposed = h.y + h.height - wa.y;
  if (c.edge === 'bottom') exposed = wa.y + wa.height - h.y;
  const ok = exposed === base.revealPx;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.edge.padEnd(6)} 露出像素=${exposed} (期望 ${base.revealPx})`);
  if (!ok) failed++;
}

console.log(failed === 0 ? '\nALL GEOMETRY TESTS PASSED' : `\n${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
