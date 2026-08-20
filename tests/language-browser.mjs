import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '4176', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9229', `--user-data-dir=/tmp/helpdream-language-test-${process.pid}`, 'about:blank'
], { stdio: 'ignore' });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (fn, attempts = 60) => {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch { await delay(100); }
  }
  throw new Error('Timed out waiting for browser');
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
  await waitFor(() => fetch('http://127.0.0.1:9229/json/version').then(response => {
    if (!response.ok) throw new Error('Chrome not ready');
    return response.json();
  }));
  const target = await fetch('http://127.0.0.1:9229/json/new?http://127.0.0.1:4176/', { method: 'PUT' }).then(response => response.json());
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

  for (const path of ['/', '/en/']) {
    for (const width of [320, 360, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await cdp('Page.navigate', { url: `http://127.0.0.1:4176${path}` });
      await waitFor(async () => {
        const { result } = await cdp('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (result.value !== 'complete') throw new Error('loading');
        return true;
      });
      const { result } = await cdp('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const header = document.querySelector('.nav-inner').getBoundingClientRect();
          const language = document.querySelector('.language-switch').getBoundingClientRect();
          const menu = document.querySelector('.menu-toggle').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            headerLeft: header.left,
            headerRight: header.right,
            languageLeft: language.left,
            languageRight: language.right,
            menuRight: menu.right,
            languageVisible: language.width > 0 && language.height > 0
          };
        })()`
      });
      const actual = result.value;
      assert.equal(actual.overflow, 0, `${path} must not overflow at ${width}px`);
      assert.ok(actual.headerLeft >= 0 && actual.headerRight <= width, `${path} header must fit at ${width}px`);
      assert.ok(actual.languageVisible && actual.languageLeft >= 0 && actual.languageRight <= width, `${path} language switch must remain visible at ${width}px`);
      assert.ok(actual.menuRight <= width, `${path} menu button must fit at ${width}px`);
    }
  }
  console.log('PASS bilingual header at 320px, 360px, and 390px');
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
}
