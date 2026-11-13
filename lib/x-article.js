// X 长文（x.com/i/article/...）在 RSSHub 里只有一个链接，标题和摘要都是这个 URL。
// 抓回原文后，正文里的 <h1> 是文章标题，第一个 <blockquote> 是作者给的引述。
const cheerio = require('cheerio');

const X_ARTICLE_URL = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/\d+\/?$/i;
const SUMMARY_LIMIT = 320;
const PAGE_CHROME_HEADINGS = new Set(['article', 'conversation']);

function plain(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isXArticleTitle(title) {
  return X_ARTICLE_URL.test(plain(title));
}

// 只认 X 长文这一种情况：标题本身就是长文链接。
function isXArticleEntry(entry) {
  return Boolean(entry && isXArticleTitle(entry.title));
}

// X 普通推文：RSSHub 已给出完整推文和图片，推文页抓回来只有登录外壳加重复正文，
// 还会覆盖原正文。只按链接形状判断，不依赖 X 页面结构；X 长文仍需抓原文。
const X_STATUS_URL = /^https?:\/\/(?:(?:www|mobile)\.)?(?:x|twitter)\.com\/[^/?#\s]+\/status(?:es)?\/\d+/i;

function isPlainXPost(entry) {
  return Boolean(entry && X_STATUS_URL.test(plain(entry.link)) && !isXArticleEntry(entry));
}

function extractMeta(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: true }, false);
  const title = plain($('h1').first().text());
  if (!title) return null;
  let summary = plain($('blockquote').first().text());
  if (!summary) {
    summary = $('p').toArray().map((node) => plain($(node).text())).find((text) => text.length >= 20) || '';
  }
  return { title: title.slice(0, 300), summary: summary.slice(0, SUMMARY_LIMIT) };
}

// 去掉未登录抓页时混进来的「Article / Conversation」小标题和登录注册链接。
function cleanContent(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false }, false);
  $('h2').each((_, node) => {
    if (PAGE_CHROME_HEADINGS.has(plain($(node).text()).toLowerCase())) $(node).remove();
  });
  $('a[href*="/i/jf/onboarding/"]').remove();
  return $.html().trim();
}

// 修复旧数据：部署「普通推文不抓原文」之前，推文页外壳已覆盖了部分推文正文。
// 从外壳里取回推文正文与配图，排成 RSSHub 的样子（<br> 分段、配图跟在正文后）。
// 只用于一次性修复库里的历史数据；新推文不再抓原文，不依赖这里跟随 X 改版。
const X_STATUS_PARTS = /^https?:\/\/(?:(?:www|mobile)\.)?(?:x|twitter)\.com\/([^/?#\s]+)\/status(?:es)?\/(\d+)/i;
const PAGE_CHROME_MARK = '/i/jf/onboarding/';
const TWEET_MEDIA = /^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//i;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPageChrome(entry) {
  return Boolean(entry && String(entry.content || '').includes(PAGE_CHROME_MARK));
}

// 只有配图的推文 RSS 不带摘要，刷新时会留下抓页时写入的外壳摘要。
function hasChromeSummary(entry) {
  return Boolean(entry && /^Post Log in Sign up\b/.test(String(entry.summary || '')));
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function compactText(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;|\s+/g, '');
}

// 推文正文夹在作者的 @账号 链接和指向本条推文的时间链接之间。作者引用或回复自己的推文时，
// 页面里会出现多个同名 @账号，用 <h1>「×× on X: "正文"」的开头认出本条推文从哪个开始。
// 都认不出时取最后一个；连时间链接都没有就只用 <h1> 里的正文。
function tweetBodyFromChrome(html, handle, id) {
  const heading = /<h1>[\s\S]*? on X: "([\s\S]*)"<\/h1>/i.exec(html);
  const headingText = heading ? heading[1] : '';
  const end = html.search(new RegExp(`<a\\b[^>]*\\bhref="https?://(?:www\\.)?(?:x|twitter)\\.com/[^/"]+/status/${id}"`, 'i'));
  if (end > 0) {
    const marker = new RegExp(`>@${escapeRegExp(handle)}</a>`, 'gi');
    const starts = [...html.slice(0, end).matchAll(marker)].map((match) => match.index + match[0].length);
    const lead = compactText(headingText).slice(0, 20);
    const own = lead && starts.find((start) => compactText(html.slice(start, end)).startsWith(lead));
    const start = own || starts[starts.length - 1];
    if (start > 0) return html.slice(start, end);
  }
  return headingText;
}

function restorePlainPost(entry) {
  if (!isPlainXPost(entry) || !hasPageChrome(entry)) return null;
  const [, handle, id] = X_STATUS_PARTS.exec(plain(entry.link));
  const raw = tweetBodyFromChrome(String(entry.content), handle, id).replace(/<!--[\s\S]*?-->/g, '');
  const $ = cheerio.load(raw, { decodeEntities: false }, false);
  const media = [];
  $('img').each((_, node) => {
    const src = String($(node).attr('src') || '').replace(/&amp;/g, '&');
    if (TWEET_MEDIA.test(src)) media.push(src);
    $(node).remove();
  });
  // 引用推文卡片从第一个个人主页链接开始：去掉空的头像链接，名字、@账号、时间之间补空格，整体放进引用块。
  $('a').each((_, node) => {
    if (!$(node).text().trim()) $(node).remove();
  });
  const lines = (html) => html.trim().replace(/\r?\n/g, '<br>').replace(/^(?:<br>)+|(?:<br>)+$/g, '');
  const body = $.html();
  const card = body.search(/<a\b[^>]*\bhref="https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}"/i);
  const quoted = (html) => lines(html).replace(/(\/status\/\d+"[^>]*>[^<]*<\/a>)(?!<br>)/, '$1<br>');
  const text = (card > 0
    ? `${lines(body.slice(0, card))}<blockquote>${quoted(body.slice(card))}</blockquote>`
    : lines(body)).replace(/<\/a><a\b/g, '</a> <a');
  const summary = plain(cheerio.load(text.replace(/<br>/g, ' '), null, false).text()).slice(0, SUMMARY_LIMIT);
  if (!summary) {
    // 敏感内容、仅订阅者可见等页面没有正文：退回 RSSHub 给的标题（推文开头），总比外壳强。
    const title = plain(entry.title);
    if (!title || title === '(无标题)') return null;
    return {
      content: escapeHtml(title),
      summary: title.slice(0, SUMMARY_LIMIT),
      image: /\/profile_images\//.test(entry.image || '') ? null : entry.image || null,
    };
  }
  // 与 RSSHub 入库时一致：src 和 image 字段里的 & 都保留为 &amp;。
  const encoded = media.map((src) => src.replace(/&/g, '&amp;'));
  const images = encoded.map((src) => `<img src="${src}" referrerpolicy="no-referrer">`).join('');
  return {
    content: images ? `${text}<br>${images}` : text,
    summary,
    // 抓页时封面可能被换成了作者头像；优先用推文自己的配图。
    image: encoded[0] || (/\/profile_images\//.test(entry.image || '') ? null : entry.image) || null,
  };
}

module.exports = { isXArticleTitle, isXArticleEntry, isPlainXPost, hasPageChrome, hasChromeSummary, restorePlainPost, extractMeta, cleanContent };
