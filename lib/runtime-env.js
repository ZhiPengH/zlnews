// 运行配置读取。环境变量统一用 ZLNEWS_ 前缀；旧部署里的 QMREADER_ 继续认，便于平滑迁移。
const path = require('path');

function env(name) {
  return String(process.env[`ZLNEWS_${name}`] || process.env[`QMREADER_${name}`] || '').trim();
}

const DATA_DIR = env('DATA_DIR') ? path.resolve(env('DATA_DIR')) : path.join(__dirname, '..', 'data');

module.exports = { env, DATA_DIR };
