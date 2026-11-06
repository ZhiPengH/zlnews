# 纵览News（zlnews）

自托管的个人 RSS 阅读服务：订阅源抓取、双语翻译、AI 改写与摘要、文章对话、人工点评和广场。
部署在懒猫微服的受保护入口后面，供本人在 Mac（Cindy 插件）和 iPhone 上使用。

本项目基于 [joeseesun/qmreader](https://github.com/joeseesun/qmreader)（MIT 许可）修改而来，
已按个人用途大幅改动：固定个人身份、订阅管理、X 长文标题补全、可自定义的改写提示词等。
原作者的版权声明保留在 [LICENSE](LICENSE) 中。

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

默认监听 `http://localhost:8080`。只想本地监听：

```bash
HOST=127.0.0.1 PORT=3000 npm start
```

运行数据写在 `data/`：数据库 `zlnews.sqlite`、RSS 缓存 `cache.json` 等，默认不提交到 Git。

## 配置

`.env.example` 只列变量名和公开默认值。常用变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 空 | 服务端 DeepSeek key，用于标题翻译和默认改写 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 服务端默认模型 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek 接口地址 |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 空 | 非 DeepSeek 的服务端模型配置 |
| `HOST` / `PORT` | `0.0.0.0` / `8080` | 监听地址与端口 |
| `PUBLIC_ORIGIN` | 空 | 对外访问地址，用于写接口来源校验和生成链接 |
| `RSSHUB_INTERNAL_ORIGIN` | 空 | 内部 RSSHub 地址（Twitter 等路由） |
| `STARTUP_REFRESH_DELAY_MS` | `30000` | 启动后多久首次全量刷新，`-1` 禁用 |
| `FRESHNESS_SWEEP_INTERVAL_MS` | `300000` | 轻量增量检查间隔 |
| `NEWS_REFRESH_INTERVAL_MS` | `1800000` | 资讯类源检查间隔 |
| `ARTICLE_REFRESH_INTERVAL_MS` | `7200000` | 文章类源检查间隔 |
| `PODCAST_REFRESH_INTERVAL_MS` | `21600000` | 播客类源检查间隔 |
| `FETCH_SOURCE_CONCURRENCY` | `6` | 批量刷新并发数，1–8 |
| `TITLE_TRANSLATION_LIMIT` | `80` | 单轮标题翻译上限 |
| `AUTO_REWRITE_SOURCE_IDS` | 空 | 限定自动改写的源 |
| `AUTO_REWRITE_LIMIT_PER_SOURCE` | `3` | 每个源自动改写条数 |
| `ZLNEWS_DATA_DIR` | `./data` | 运行数据目录 |
| `ZLNEWS_DB_FILE` | `$ZLNEWS_DATA_DIR/zlnews.sqlite` | 数据库文件 |
| `UMAMI_SRC` / `UMAMI_WEBSITE_ID` | 空 | 可选的 Umami 统计，两项都填才启用 |

旧版环境变量 `QMREADER_DATA_DIR`、`QMREADER_DB_FILE` 仍然认，新名字优先。
未设置 `ZLNEWS_DB_FILE` 时，如果数据目录里只有旧的 `qmreader.sqlite`，启动时会连同
`-wal`、`-shm` 文件一起改名为 `zlnews.sqlite`。

## 改写提示词

AI 改写默认使用「原版风格」预设，即上游项目的改写提示词，原样保留在 `lib/rewrite-prompts.js`。
可以在 Cindy 插件「我的 → 资料 → 改写提示词」中改为自定义提示词：

- 自定义内容替换写作风格；Product Hunt、Hacker News、论文解读仍会附上各自的材料规则。
- 设置保存在个人账号上（`users.rewrite_prompt_mode`、`rewrite_prompt_custom`），后台自动改写也用它。
- 换用提示词后，已有改写会显示为可更新，不会自动重写。

相关接口：`GET /api/me/rewrite-prompts`（预设与当前设置），`PATCH /api/me/profile` 的 `rewritePrompt` 字段。

## 个人身份与访问保护

服务固定使用 `zonglan-personal` 个人身份，没有登录、注册或密码。访问保护完全依赖懒猫的受保护入口，
Compose 只把端口绑定到 `127.0.0.1`，不要直接暴露到公网。原管理员接口（用户管理、投稿审核、全量刷新、源开关）对个人身份保持拒绝。

## 刷新机制

1. **Fetch worker**：抓 RSS 和页面，写入缓存与 SQLite，Web 进程立即可见。
2. **AI worker**：只对有新条目的源排队做标题翻译和自动改写，失败不影响阅读。

X 长文在 RSSHub 中只有链接。抓回原文后会用正文 `<h1>` 作标题、首个引述作摘要，RSS 再刷新时也会保留。

手动刷新：

```bash
npm run refresh:worker
node scripts/refresh-worker.js --kind=auto-rewrite --sources=hackernews
```

## 部署

生产环境在懒猫 Linux 的 Docker Compose 中运行：服务和容器名 `zlnews`，端口 `127.0.0.1:3088`，
数据目录挂载 `./data`。日常更新使用：

```bash
bash ops/news/deploy.sh check    # 本地测试 + 只读检查服务器
bash ops/news/deploy.sh deploy   # 备份、上传、构建、替换容器、健康检查
```

流程、失败处理与回退见 [ops/news/README.md](ops/news/README.md)。

## 项目结构

```text
server.js                  Express 入口、API、调度器、静态托管
lib/sources.js             内置信息源与刷新策略
lib/subscriptions.js       订阅管理
lib/fetcher.js             RSS / RSSHub / 页面抓取与缓存
lib/x-article.js           X 长文标题与摘要补全
lib/background-jobs.js     后台刷新、标题翻译、自动改写
lib/deepseek.js            AI 调用：翻译、改写、摘要、对话
lib/rewrite-prompts.js     改写提示词预设与自定义
lib/store.js               SQLite 结构与数据访问
lib/runtime-env.js         运行配置（ZLNEWS_ 环境变量）
public/                    网页前端
scripts/                   refresh worker 与 systemd 安装脚本
ops/news/                  部署脚本
data/                      运行数据，不提交
```

## 验证

```bash
npm test
python3 ops/news/test_deploy.py
```

## License

MIT License，见 [LICENSE](LICENSE)。上游项目 © 2026 向阳乔木。
