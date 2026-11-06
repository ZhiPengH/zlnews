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

module.exports = { isXArticleTitle, isXArticleEntry, extractMeta, cleanContent };
