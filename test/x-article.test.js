const test = require('node:test');
const assert = require('node:assert/strict');

const { isXArticleTitle, isXArticleEntry, isPlainXPost, restorePlainPost, extractMeta, cleanContent } = require('../lib/x-article');

// 按旧版推文页外壳的结构构造：登录注册链接 + <h1>「×× on X: "正文"」+ 作者链接 + 正文与配图 + 时间链接。
function chromePost({ handle = 'baoshu88', id = '2121107563639181384', text, extra = '', heading = text } = {}) {
  const login = `<a href="https://x.com/i/jf/onboarding/web?mode=login&amp;redirect_after_login=%2F${handle}%2Fstatus%2F${id}">Log in</a>`;
  return `<!--$--><h2>Post</h2><!--/$-->${login}<a href="https://x.com/i/jf/onboarding/web?mode=signup">Sign up</a>`
    + `<h1>包叔 on X: "${heading}"</h1><!--$--><h2>Conversation</h2>`
    + `<a href="https://x.com/${handle}"><img alt="@${handle}" src="https://pbs.twimg.com/profile_images/1/a_normal.jpg"></a>`
    + `<a href="https://x.com/${handle}">包叔</a><a href="https://x.com/${handle}">@${handle}</a><!--$-->${text}${extra}`
    + `<a href="https://x.com/${handle}/status/${id}">3:20 AM · Nov 13, 2026</a><a href="https://x.com/${handle}/status/${id}">118.1KViews</a>`;
}

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

test('plain X posts are recognised by link shape, X articles are not', () => {
  const post = (link, title = '推文正文') => ({ link, title });
  assert.equal(isPlainXPost(post('https://x.com/whyyoutouzhele/status/2121166197823590462')), true);
  assert.equal(isPlainXPost(post('https://twitter.com/a_b/status/1?s=20')), true);
  assert.equal(isPlainXPost(post('https://mobile.twitter.com/a/statuses/1')), true);
  assert.equal(isPlainXPost(post('https://www.x.com/a/status/1/photo/1')), true);
  // X 长文：标题是长文链接，仍需抓原文
  assert.equal(isPlainXPost(post('https://x.com/CDTChinese/status/2118311209124639213', 'https://x.com/i/article/2118310952408154112')), false);
  assert.equal(isPlainXPost(post('https://x.com/i/article/2118310952408154112')), false);
  assert.equal(isPlainXPost(post('https://x.com/whyyoutouzhele')), false);
  assert.equal(isPlainXPost(post('https://notx.com/a/status/1')), false);
  assert.equal(isPlainXPost(post('https://example.com/?u=https://x.com/a/status/1')), false);
  assert.equal(isPlainXPost(null), false);
});

test('restorePlainPost rebuilds tweet text and media from page chrome in RSS layout', () => {
  const link = 'https://x.com/baoshu88/status/2121107563639181384';
  const content = chromePost({
    text: '第一段\n\n第二段',
    extra: '<img alt="" src="https://pbs.twimg.com/media/A?format=webp&amp;name=large">',
  });
  const restored = restorePlainPost({ link, title: '第一段', content, image: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg' });
  assert.equal(restored.content, '第一段<br><br>第二段<br><img src="https://pbs.twimg.com/media/A?format=webp&amp;name=large" referrerpolicy="no-referrer">');
  assert.equal(restored.summary, '第一段 第二段');
  assert.equal(restored.image, 'https://pbs.twimg.com/media/A?format=webp&amp;name=large');
  assert.doesNotMatch(restored.content, /Log in|Sign up|on X:|Conversation|Views|profile_images/);
});

test('restorePlainPost keeps the own tweet when it quotes the same author, and puts the quote in a blockquote', () => {
  const quote = '<a href="https://x.com/baoshu88"><img src="https://pbs.twimg.com/profile_images/1/a_normal.jpg"></a>'
    + '<a href="https://x.com/baoshu88">包叔</a><a href="https://x.com/baoshu88">@baoshu88</a>'
    + '<a href="https://x.com/baoshu88/status/1">18h</a>被引用的旧推文';
  const restored = restorePlainPost({ link: 'https://x.com/baoshu88/status/2121107563639181384', title: '扎心！', content: chromePost({ text: '扎心！', extra: quote }) });
  assert.match(restored.content, /^扎心！<blockquote>/);
  assert.match(restored.content, /<a href="https:\/\/x\.com\/baoshu88\/status\/1">18h<\/a><br>被引用的旧推文<\/blockquote>$/);
});

test('restorePlainPost falls back to the heading text and ignores clean or non-tweet entries', () => {
  const link = 'https://x.com/baoshu88/status/2121107563639181384';
  const noTimeLink = chromePost({ text: '正文' }).replace(/<a href="https:\/\/x\.com\/baoshu88\/status\/[^>]*>[^<]*<\/a>/g, '');
  assert.equal(restorePlainPost({ link, title: 't', content: noTimeLink }).content, '正文');
  assert.equal(restorePlainPost({ link, title: 't', content: '<p>干净的 RSS 正文</p>' }), null);
  // 敏感内容页没有正文：退回标题，不带遮挡图
  const sensitive = '<h2>Post</h2><a href="https://x.com/i/jf/onboarding/web?mode=login">Log in</a><h1>Post</h1>'
    + '<img alt="" src="https://pbs.twimg.com/media/GxJIrSUagAAK-ZP?format=jpg&amp;name=240x240">Sensitive ContentThis post is only available in the X app';
  assert.deepEqual(restorePlainPost({ link, title: '推文开头 <b>…', content: sensitive, image: null }),
    { content: '推文开头 &lt;b&gt;…', summary: '推文开头 <b>…', image: null });
  assert.equal(restorePlainPost({ link, title: '(无标题)', content: sensitive }), null);
  assert.equal(restorePlainPost({ link: 'https://example.com/a', title: 't', content: chromePost({ text: '正文' }) }), null);
  assert.equal(restorePlainPost({ link, title: 'https://x.com/i/article/1', content: chromePost({ text: '正文' }) }), null);
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
