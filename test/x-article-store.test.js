const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlnews-x-article-'));
process.env.ZLNEWS_DATA_DIR = testDataDir;

const store = require('../lib/store');
const fetcher = require('../lib/fetcher');

after(() => fs.rmSync(testDataDir, { recursive: true, force: true }));

const URL_TITLE = 'https://x.com/i/article/2118310952408154112';
const BODY = '<h2>Article</h2><a href="https://x.com/i/jf/onboarding/web?mode=login">Log in</a>'
  + '<h1>鱼眼观察｜为什么比起没有社保，被缴社保让劳动者更焦虑</h1>'
  + '<blockquote>本文原载于<a href="https://mp.weixin.qq.com/s/K2">微信公众号-鱼眼观察</a>，作者：公民于平。</blockquote>'
  + '<p>' + '正文。'.repeat(200) + '</p>';

function feedEntry(id, extra = {}) {
  return {
    id, sourceId: 'cdt', title: URL_TITLE, link: `https://x.com/CDTChinese/status/${id}`,
    summary: URL_TITLE, content: URL_TITLE, publishedTs: 1, ...extra,
  };
}

test('startup repair fills title and quote from fetched content and cleans page chrome', () => {
  store.upsertEntries([feedEntry('fetched', { content: BODY }), feedEntry('bare')]);
  // 刚失败过的条目不会再排队，测试就不会真的去请求 X。
  store.markEntryOriginalFetchAttempt('bare', 'offline');
  const result = fetcher.repairXArticleEntries();
  assert.equal(result.fixed, 1);
  const fixed = store.getEntry('fetched');
  assert.equal(fixed.title, '鱼眼观察｜为什么比起没有社保，被缴社保让劳动者更焦虑');
  assert.equal(fixed.summary, '本文原载于微信公众号-鱼眼观察，作者：公民于平。');
  assert.equal(fixed.content.includes('Log in'), false);
  assert.equal(store.getEntry('bare').title, URL_TITLE);
});

test('a later RSS refresh keeps the repaired title instead of the link', () => {
  const [kept] = fetcher.keepXArticleMeta([feedEntry('fetched')]);
  assert.equal(kept.title, '鱼眼观察｜为什么比起没有社保，被缴社保让劳动者更焦虑');
  store.upsertEntries([kept]);
  assert.equal(store.getEntry('fetched').title, kept.title);
  assert.ok(store.getEntry('fetched').content.includes('<h1>'), 'longer stored content survives the upsert');
});

const CHROME = '<h2>Post</h2><a href="https://x.com/i/jf/onboarding/web?mode=login">Log in</a>'
  + `<h1>包叔 on X: "${'推文正文。'.repeat(80)}"</h1><h2>Conversation</h2>`
  + '<a href="https://x.com/baoshu88">@baoshu88</a>' + '推文正文。'.repeat(80)
  + '<a href="https://x.com/baoshu88/status/77">3:20 AM</a>';
const tweet = (id, extra = {}) => ({
  id, sourceId: 'baoshu', title: '推文正文。', link: `https://x.com/baoshu88/status/${id}`,
  summary: '推文正文。', content: '推文正文。'.repeat(80), publishedTs: 2, ...extra,
});

test('RSS content wins over longer stored page chrome for plain X posts', () => {
  store.upsertEntries([tweet('77', { content: CHROME })]);
  store.upsertEntries([tweet('77')]);
  assert.equal(store.getEntry('77').content, '推文正文。'.repeat(80));
});

test('startup repair restores plain X posts still holding page chrome, once', () => {
  store.upsertEntries([tweet('77')]);
  store.updateEntryContent('77', { content: CHROME });
  assert.equal(fetcher.repairPlainXPostEntries().fixed, 1);
  const restored = store.getEntry('77');
  assert.equal(restored.content, '推文正文。'.repeat(80));
  assert.equal(restored.content.includes('Log in'), false);
  assert.deepEqual(fetcher.repairPlainXPostEntries(), { fixed: 0, skipped: 0 });
});

test('startup repair clears a leftover chrome summary on image-only tweets', () => {
  store.upsertEntries([tweet('78', { content: '<br><img src="https://pbs.twimg.com/media/A">', summary: '' })]);
  store.replaceEntrySummary('78', 'Post Log in Sign up Post Log in Sign up 包叔 on X 包叔 @baoshu88 8:05 PM');
  assert.equal(fetcher.repairPlainXPostEntries().fixed, 1);
  assert.equal(store.getEntry('78').summary, '');
  assert.equal(store.getEntry('78').content, '<br><img src="https://pbs.twimg.com/media/A">');
});

test('ordinary entries pass through untouched', () => {
  const plain = { id: 'n', sourceId: 'cdt', title: '普通推文', summary: 's' };
  assert.equal(fetcher.keepXArticleMeta([plain])[0], plain);
  assert.equal(fetcher.keepXArticleMeta([feedEntry('unknown')])[0].title, URL_TITLE);
});
