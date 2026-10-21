const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {test} = require('node:test');

const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const blog = read('blog/index.html');
const header = blog.match(/<header\b[^>]*>[\s\S]*?<\/header>/)[0];

test('Blog has desktop and mobile language controls without a nonexistent English link', () => {
  const switches = [...header.matchAll(/<(nav|div) class="language-switch[^\"]*"[^>]*>([\s\S]*?)<\/\1>/g)];
  assert.equal(switches.length, 2);
  for (const [, , content] of switches) {
    assert.match(content, /<a[^>]*href="\/blog\/"[^>]*aria-current="page"[^>]*>JP<\/a>/);
    assert.match(content, /<span[^>]*aria-disabled="true"[^>]*>EN<\/span>/);
    assert.doesNotMatch(content, /href="\/en\/blog\//);
  }
});

test('Blog navigation matches Home and marks Blog as the current page', () => {
  const nav = html => html.match(/<nav class="pc-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = html => [...nav(html).matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links(blog), links(read('index.html')));
  assert.match(nav(blog), /href="\/blog\/" class="current"/);
  assert.match(header, /aria-controls="mobile-navigation"/);
  assert.match(header, /id="mobile-navigation"/);
});
