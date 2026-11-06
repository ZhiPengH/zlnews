const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 模拟旧部署：只有 qmreader.sqlite，并且只设置了旧环境变量。
const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlnews-legacy-'));
{
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(legacyDir, 'qmreader.sqlite'));
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('old-data');");
  db.close();
}
delete process.env.ZLNEWS_DATA_DIR;
delete process.env.ZLNEWS_DB_FILE;
process.env.QMREADER_DATA_DIR = legacyDir;
delete process.env.QMREADER_DB_FILE;

const store = require('../lib/store');

after(() => fs.rmSync(legacyDir, { recursive: true, force: true }));

test('an old qmreader.sqlite is renamed and its data kept', () => {
  assert.equal(store.DB_FILE, path.join(legacyDir, 'zlnews.sqlite'));
  assert.equal(fs.existsSync(path.join(legacyDir, 'qmreader.sqlite')), false);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(store.DB_FILE);
  assert.equal(db.prepare('SELECT v FROM marker').get().v, 'old-data');
  db.close();
});

test('migration is skipped once the new database exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlnews-both-'));
  fs.writeFileSync(path.join(dir, 'zlnews.sqlite'), 'new');
  fs.writeFileSync(path.join(dir, 'qmreader.sqlite'), 'old');
  assert.equal(store.migrateLegacyDatabase(dir), false);
  assert.equal(fs.readFileSync(path.join(dir, 'zlnews.sqlite'), 'utf8'), 'new');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rewrite prompt setting is saved with the profile and kept when omitted', () => {
  const user = store.getPersonalUser();
  assert.deepEqual(user.rewritePrompt, { mode: 'preset', custom: '' });
  const saved = store.updateUserProfile(user.id, { displayName: '志行', rewritePrompt: { mode: 'custom', custom: '我的风格' } });
  assert.deepEqual(saved.rewritePrompt, { mode: 'custom', custom: '我的风格' });
  assert.deepEqual(store.getRewritePromptSetting(), { mode: 'custom', custom: '我的风格' });
  // 原网页前端保存资料时不带提示词，不能把设置清掉。
  const kept = store.updateUserProfile(user.id, { displayName: '志行', bio: 'x' });
  assert.deepEqual(kept.rewritePrompt, { mode: 'custom', custom: '我的风格' });
  assert.equal(store.getPersonalDisplayName(), '志行');
  assert.throws(() => store.updateUserProfile(user.id, { rewritePrompt: { mode: 'custom', custom: '' } }), /请填写/);
});
