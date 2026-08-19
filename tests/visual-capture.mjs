import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '4175', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9228', `--user-data-dir=/tmp/helpdream-visual-${process.pid}`, 'about:blank'
], { stdio: 'ignore' });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (fn, attempts = 60) => {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch { await delay(100); }
  }
  throw new Error('Timed out waiting for visual capture');
};

let ws;
let nextId = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

try {
  await waitFor(() => fetch('http://127.0.0.1:9228/json/version').then(response => {
    if (!response.ok) throw new Error('Chrome not ready');
    return response.json();
  }));
  const target = await fetch('http://127.0.0.1:9228/json/new?http://127.0.0.1:4175', { method: 'PUT' }).then(response => response.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.reload', { ignoreCache: true });
  await waitFor(async () => {
    const { result } = await cdp('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (result.value !== 'complete') throw new Error('Page loading');
  });

  for (const section of ['top', 'services', 'lab', 'approach', 'contact']) {
    const expression = section === 'top'
      ? "document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0, 0)"
      : `document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0, document.getElementById(${JSON.stringify(section)}).offsetTop - 66)`;
    await cdp('Runtime.evaluate', { expression });
    await delay(250);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const path = `/tmp/helpdream-mobile-${section}.png`;
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(path);
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
}
