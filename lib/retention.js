// 文章保留期限：库里只留最近 N 天（默认 90 天）的文章，控制数据库与缓存体积。
// - 自动刷新跳过发布已超期的文章，避免清掉的旧文被订阅源重新带回来、变成未读；
// - 手动刷新不受限，导入的旧文从导入时起算保留期（清理同时看发布时间和导入时间）；
// - 收藏、改写、翻译、点评、聊天过的文章，以及读者提交的链接永久保留（见 store.deleteExpiredEntries）。
// ZLNEWS_ENTRY_RETENTION_DAYS=0 关闭清理与入库过滤。
const { env } = require('./runtime-env');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;

function retentionDays() {
  const raw = env('ENTRY_RETENTION_DAYS');
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const days = Number.parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

// 0 表示不限期。
function retentionCutoff(now = Date.now()) {
  const days = retentionDays();
  return days ? now - days * DAY_MS : 0;
}

// 没有发布时间的条目无从判断，照常入库。
function isWithinRetention(entry, now = Date.now()) {
  const cutoff = retentionCutoff(now);
  const publishedTs = Number(entry && entry.publishedTs) || 0;
  return !cutoff || !publishedTs || publishedTs >= cutoff;
}

module.exports = { DAY_MS, retentionDays, retentionCutoff, isWithinRetention };
