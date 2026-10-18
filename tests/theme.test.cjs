const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

function load({saved = null, systemDark = true, blocked = false} = {}) {
  const root = {dataset: {}};
  const storage = {value: saved};
  const document = {
    documentElement: root,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({setAttribute() {}, addEventListener(type, handler) {this[type] = handler;}}),
  };
  const context = vm.createContext({document, window: {
    matchMedia: () => ({matches: systemDark, addEventListener() {}}),
    localStorage: {
      getItem() {if (blocked) throw Error('blocked'); return storage.value;},
      setItem(key, value) {if (blocked) throw Error('blocked'); storage.value = value;},
    },
  }});
  const script = readFileSync(resolve(__dirname, '../js/script.js'), 'utf8').split('function normalizePath(')[0];
  vm.runInContext(script, context);
  return {root, storage, run: source => vm.runInContext(source, context)};
}

test('初回はOSがダークでもライトで表示する', () => {
  const app = load();
  assert.equal(app.run('resolvedTheme()'), 'light');
  assert.equal(app.root.dataset.theme, 'light');
});
test('保存済みのダーク設定を復元する', () => {
  const app = load({saved: 'dark', systemDark: false});
  assert.equal(app.run('resolvedTheme()'), 'dark');
  assert.equal(app.root.dataset.theme, 'dark');
});
test('切り替えた設定を保存し、次の表示で復元する', () => {
  const app = load();
  app.run('createThemeToggle().click()');
  assert.equal(app.root.dataset.theme, 'dark');
  assert.equal(app.storage.value, 'dark');
  assert.equal(load({saved: app.storage.value}).run('resolvedTheme()'), 'dark');
});
test('保存できない場合もページ内で往復切り替えできる', () => {
  const app = load({blocked: true});
  app.run('const button = createThemeToggle(); button.click()');
  assert.equal(app.run('resolvedTheme()'), 'dark');
  app.run('button.click()');
  assert.equal(app.run('resolvedTheme()'), 'light');
});
