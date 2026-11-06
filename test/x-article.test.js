const test = require('node:test');
const assert = require('node:assert/strict');

const { isXArticleTitle, isXArticleEntry, extractMeta, cleanContent } = require('../lib/x-article');

const SAMPLE = '<!--$--><h2>Article</h2><!--/$--><a href="https://x.com/i/jf/onboarding/web?mode=login">Log in</a>'
  + '<a href="https://x.com/i/jf/onboarding/web?mode=signup">Sign up</a><h2>Conversation</h2>'
  + '<a href="https://x.com/CDTChinese">中国数字时代</a>'
  + '<h1>鱼眼观察｜为什么比起没有社保，被缴社保让劳动者更焦虑</h1>6 min read'
  + '<blockquote>本文原载于<a href="https://mp.weixin.qq.com/s/K2WXOROu98txAdTfi2V_Mw">微信公众号-鱼眼观察</a>，作者：公民于平，2026.11.5。版权归原作者所有，中国数字时代存档。</blockquote>'
  + '<p>☞ <a href="https://chinadigitaltimes.net/chinese/733624.html">阅读原文</a></p>'
  + '<h2>小节标题</h2><p>最近关于社保的新闻有些多。先是人社部门发言人提出社保要通过“数据找人”。</p>';

test('only X article links count as placeholder titles', () => {
  assert.ok(isXArticleTitle('https://x.com/i/article/2118310952408154112'));
  assert.ok(isXArticleTitle(' https://twitter.com/i/article/1/ '));
  assert.equal(isXArticleTitle('https://x.com/CDTChinese/status/2118311209124639213'), false);
  assert.equal(isXArticleTitle('https://example.com/i/article/1'), false);
  assert.equal(isXArticleTitle('鱼眼观察｜标题'), false);
  assert.equal(isXArticleTitle('看这篇 https://x.com/i/article/1'), false);
  assert.equal(isXArticleEntry({ title: 'https://x.com/i/article/9' }), true);
  assert.equal(isXArticleEntry(null), false);
});

test('title comes from h1 and the subtitle from the first quote as plain text', () => {
  assert.deepEqual(extractMeta(SAMPLE), {
    title: '鱼眼观察｜为什么比起没有社保，被缴社保让劳动者更焦虑',
    summary: '本文原载于微信公众号-鱼眼观察，作者：公民于平，2026.11.5。版权归原作者所有，中国数字时代存档。',
  });
});

test('without a quote the first real paragraph is used; without h1 nothing changes', () => {
  const meta = extractMeta('<h1>标题</h1><p>☞ 原文</p><p>这是一段足够长的正文内容，用来当副标题使用的。</p>');
  assert.equal(meta.summary, '这是一段足够长的正文内容，用来当副标题使用的。');
  assert.equal(extractMeta('<p>只有正文</p>'), null);
  assert.equal(extractMeta(''), null);
});

test('page chrome is removed but article headings and links stay', () => {
  const cleaned = cleanContent(SAMPLE);
  assert.equal(cleaned.includes('Log in'), false);
  assert.equal(cleaned.includes('Sign up'), false);
  assert.equal(/<h2>(Article|Conversation)<\/h2>/.test(cleaned), false);
  assert.ok(cleaned.includes('<h2>小节标题</h2>'));
  assert.ok(cleaned.includes('<h1>鱼眼观察'));
  assert.ok(cleaned.includes('https://mp.weixin.qq.com/s/K2WXOROu98txAdTfi2V_Mw'));
  assert.ok(cleaned.includes('https://x.com/CDTChinese'));
});
