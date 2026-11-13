const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlnews-retention-'));
process.env.ZLNEWS_DATA_DIR = testDataDir;
delete process.env.ZLNEWS_ENTRY_RETENTION_DAYS;

const retention = require('../lib/retention');
const store = require('../lib/store');
const fetcher = require('../lib/fetcher');

// 直接改库里的导入时间，模拟很久以前入库的条目。
const raw = new DatabaseSync(path.join(testDataDir, 'zlnews.sqlite'));
after(() => {
  raw.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

const DAY = retention.DAY_MS;
const NOW = Date.now();

function seed(id, { publishedDaysAgo, importedDaysAgo }) {
  store.upsertEntries([{
    id, sourceId: 'retention-src', title: id, link: `https://example.com/${id}`,
    summary: id, content: `<p>${id}</p>`, publishedTs: publishedDaysAgo === null ? 0 : NOW - publishedDaysAgo * DAY,
  }]);
  raw.prepare('UPDATE entries SET created_at = ? WHERE id = ?').run(NOW - importedDaysAgo * DAY, id);
}

test('retention defaults to 90 days and can be changed or turned off', () => {
  assert.equal(retention.retentionDays(), 90);
  process.env.ZLNEWS_ENTRY_RETENTION_DAYS = '30';
  assert.equal(retention.retentionDays(), 30);
  process.env.ZLNEWS_ENTRY_RETENTION_DAYS = '0';
  assert.equal(retention.retentionDays(), 0);
  assert.equal(retention.retentionCutoff(NOW), 0);
  assert.equal(retention.isWithinRetention({ publishedTs: 1 }, NOW), true);
  delete process.env.ZLNEWS_ENTRY_RETENTION_DAYS;
  assert.equal(retention.retentionCutoff(NOW), NOW - 90 * DAY);
});

test('auto refresh drops expired entries, manual refresh and undated entries are kept', () => {
  const entries = [
    { id: 'fresh', publishedTs: NOW - 10 * DAY },
    { id: 'old', publishedTs: NOW - 200 * DAY },
    { id: 'undated', publishedTs: 0 },
  ];
  const { keepRetainedEntries } = fetcher.__test;
  assert.deepEqual(keepRetainedEntries(entries, false).map(e => e.id), ['fresh', 'undated']);
  assert.deepEqual(keepRetainedEntries(entries, true).map(e => e.id), ['fresh', 'old', 'undated']);
});

test('expired entries are deleted unless recently imported or carrying user work', () => {
  const user = store.getPersonalUser();
  seed('expired', { publishedDaysAgo: 120, importedDaysAgo: 120 });
  seed('expired-read', { publishedDaysAgo: 120, importedDaysAgo: 120 });
  seed('undated-old', { publishedDaysAgo: null, importedDaysAgo: 120 });
  seed('manual-import', { publishedDaysAgo: 400, importedDaysAgo: 3 });
  seed('recent', { publishedDaysAgo: 10, importedDaysAgo: 10 });
  seed('starred', { publishedDaysAgo: 120, importedDaysAgo: 120 });
  seed('rewritten', { publishedDaysAgo: 120, importedDaysAgo: 120 });
  store.setUserEntryState(user.id, 'expired-read', { read: true });
  store.setUserEntryState(user.id, 'starred', { starred: true });
  store.saveRewrite('rewritten', { title: '改写', body: '正文' });

  const result = fetcher.pruneExpiredEntries({ now: NOW });
  assert.equal(result.deleted, 3);
  for (const id of ['expired', 'expired-read', 'undated-old']) assert.equal(store.getEntry(id), null, id);
  for (const id of ['manual-import', 'recent', 'starred', 'rewritten']) assert.ok(store.getEntry(id), id);
  // 已读状态没有外键，删条目时要一并清掉
  const states = raw.prepare('SELECT entry_id FROM user_entry_states WHERE entry_id IN (?, ?)').all('expired-read', 'starred');
  assert.deepEqual(states.map(row => row.entry_id), ['starred']);
  assert.equal(fetcher.pruneExpiredEntries({ now: NOW }).deleted, 0);
});

test('pruning is a no-op when retention is turned off', () => {
  seed('expired-off', { publishedDaysAgo: 500, importedDaysAgo: 500 });
  process.env.ZLNEWS_ENTRY_RETENTION_DAYS = '0';
  try {
    assert.deepEqual(fetcher.pruneExpiredEntries({ now: NOW }), { deleted: 0, cutoff: 0 });
    assert.ok(store.getEntry('expired-off'));
  } finally {
    delete process.env.ZLNEWS_ENTRY_RETENTION_DAYS;
  }
});
