// CDP 一次性评估工具：node cdp-eval.mjs "<expression>"
const target = process.argv[2];
const expr = process.argv[3];
const ws = new WebSocket(target);
let id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onopen = async () => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result, null, 1));
  process.exit(0);
};
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
ws.onerror = (e) => { console.error('WS error', e.message || e); process.exit(1); };
setTimeout(() => { console.error('timeout'); process.exit(2); }, 15000);
