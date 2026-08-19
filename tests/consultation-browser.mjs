import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9227', `--user-data-dir=/tmp/helpdream-consultation-test-${process.pid}`,
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
    const form = document.getElementById('consultation-form');
    if (!form) return { exists: false };

    window.fetch = async (url, options) => {
      window.__consultationRequest = {
        url,
        method: options.method,
        fields: Object.fromEntries(options.body.entries())
      };
      return { ok: true, json: async () => ({ success: 'true' }) };
    };

    document.getElementById('contact-name').value = '이테스트';
    document.getElementById('company').value = '테스트 마케팅팀';
    document.getElementById('contact-email').value = 'tester@example.com';
    document.getElementById('contact-phone').value = '010-1234-5678';
    document.getElementById('work').value = '매주 여러 광고 매체의 성과 데이터를 모아 보고서를 작성합니다.';
    document.getElementById('privacy-consent').checked = true;
    form.requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      exists: true,
      request: window.__consultationRequest,
      status: document.getElementById('form-message')?.textContent.trim() || '',
      successVisible: !document.getElementById('consultation-success')?.hidden,
      focused: document.activeElement?.id,
      submitDisabled: document.getElementById('consultation-submit')?.disabled,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`;

  const { result } = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const actual = result.value;
  assert.equal(actual.exists, true, '상담 신청 폼이 있어야 한다');
  assert.equal(actual.request.url, 'https://formsubmit.co/ajax/heesun.lee@helpdream.co.kr', '지정된 상담 수신 주소로 전송해야 한다');
  assert.equal(actual.request.method, 'POST');
  assert.equal(actual.request.fields['담당자명'], '이테스트');
  assert.equal(actual.request.fields['회사 또는 팀'], '테스트 마케팅팀');
  assert.equal(actual.request.fields.email, 'tester@example.com');
  assert.equal(actual.request.fields['연락처'], '010-1234-5678');
  assert.match(actual.request.fields['상담 내용'], /광고 매체/);
  assert.equal(actual.request.fields._subject, '[에이치디미디어 웹사이트] 미디어 AX 상담 신청');
  assert.match(actual.status, /접수했습니다/);
  assert.equal(actual.successVisible, true, '성공 안내를 명확히 보여야 한다');
  assert.equal(actual.focused, 'consultation-success', '성공 안내로 포커스를 이동해야 한다');
  assert.equal(actual.submitDisabled, false, '제출 후 버튼 상태가 복구되어야 한다');
  assert.equal(actual.overflow, 0, '모바일 가로 넘침이 없어야 한다');
  console.log('PASS consultation browser flow', actual);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  server.kill('SIGTERM');
}
