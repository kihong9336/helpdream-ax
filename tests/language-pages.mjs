import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const ko = await readFile(new URL('index.html', root), 'utf8');
const en = await readFile(new URL('en/index.html', root), 'utf8');
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');

assert.match(ko, /<html lang="ko">/, 'Korean page must declare Korean');
assert.match(en, /<html lang="en">/, 'English page must declare English');

for (const [name, html] of [['Korean', ko], ['English', en]]) {
  assert.match(html, /class="language-switch"/, `${name} page must show a language switch`);
  assert.match(html, /hreflang="ko"[^>]*href="https:\/\/helpdream\.co\.kr\/"/, `${name} page must link to Korean alternate`);
  assert.match(html, /hreflang="en"[^>]*href="https:\/\/helpdream\.co\.kr\/en\/"/, `${name} page must link to English alternate`);
  assert.match(html, /hreflang="x-default"[^>]*href="https:\/\/helpdream\.co\.kr\/"/, `${name} page must define the default language`);
  assert.match(html, /https:\/\/formsubmit\.co\/ajax\/heesun\.lee@helpdream\.co\.kr/, `${name} consultation form must keep the production endpoint`);
  assert.match(html, /<form[^>]*id="consultation-form"[^>]*action="https:\/\/formsubmit\.co\/heesun\.lee@helpdream\.co\.kr"[^>]*method="POST"/, `${name} form must use a safe POST fallback when JavaScript is unavailable`);
}

assert.match(ko, /href="\/en\/"[^>]*>EN</, 'Korean page must link to English');
assert.match(en, /href="\/"[^>]*>KR</, 'English page must link to Korean');
assert.match(en, /<link rel="canonical" href="https:\/\/helpdream\.co\.kr\/en\/"/, 'English canonical URL must be /en/');
assert.match(en, /Campaign work, powered by AI\./, 'English hero copy must be translated');
assert.match(en, /Media AX consultation/, 'English consultation form must be translated');
assert.doesNotMatch(en, /상담 신청|개인정보|담당자명|회사 또는 팀/, 'English form must not leak Korean UI copy');
assert.match(sitemap, /<loc>https:\/\/helpdream\.co\.kr\/en\/<\/loc>/, 'Sitemap must include the English page');

console.log('PASS bilingual pages, reciprocal language links, English copy, and sitemap');
