import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9227', `--user-data-dir=/tmp/helpdream-diagnosis-test-${process.pid}`,
  '--window-size=390,844', 'about:blank'
], { stdio: 'ignore' });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (fn, attempts = 50) => {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch { await delay(100); }
  }
  throw new Error('Timed out waiting for Chrome');
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
  await waitFor(() => fetch('http://127.0.0.1:9227/json/version').then(r => {
    if (!r.ok) throw new Error('not ready');
    return r.json();
  }));
  const target = await fetch('http://127.0.0.1:9227/json/new?http://127.0.0.1:4173', { method: 'PUT' }).then(r => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };
  await cdp('Runtime.enable');
  await waitFor(async () => {
    const { result } = await cdp('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (result.value !== 'complete') throw new Error('loading');
    return true;
  });

  const expression = `(async () => {
    const company = document.getElementById('company');
    const work = document.getElementById('work');
    company.value = '테스트 마케팅팀';
    work.value = '매주 여러 광고 매체의 성과 데이터를 모아 보고서를 작성합니다.';
    document.getElementById('diagnosis-form').requestSubmit();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = document.getElementById('diagnosis-result');
    return {
      exists: !!result,
      visible: !!result && getComputedStyle(result).display !== 'none',
      category: document.getElementById('result-category')?.textContent.trim() || '',
      pilot: document.getElementById('result-pilot')?.textContent.trim() || '',
      next: document.getElementById('result-next-step')?.textContent.trim() || '',
      focused: document.activeElement === result,
      copyButton: !!document.getElementById('copy-diagnosis')
    };
  })()`;
  const { result } = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const actual = result.value;
  assert.equal(actual.exists, true, '진단 결과 카드가 생성되어야 한다');
  assert.equal(actual.visible, true, '진단 결과 카드가 보여야 한다');
  assert.match(actual.category, /성과|리포트|데이터/, '업무 유형을 분류해야 한다');
  assert.ok(actual.pilot.length >= 20, '구체적인 추천 파일럿을 제안해야 한다');
  assert.ok(actual.next.length >= 20, '실행 가능한 다음 단계를 제안해야 한다');
  assert.equal(actual.focused, true, '모바일에서도 반응을 인지하도록 결과 카드로 포커스를 이동해야 한다');
  assert.equal(actual.copyButton, true, '결과 복사 기능이 있어야 한다');
  console.log('PASS diagnosis browser flow', actual);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
}
