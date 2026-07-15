# AI Monetization Monitor · Light Research Edition

浅色、现代化的 AI 商业化数据看板。页面沿用 AI Monetization Tracker 的公开数据结构，并通过校验后的静态快照展示：

- Frontier Lab ARR 估算与外推
- OpenRouter Token 用量、实验室份额和重点模型
- Vercel AI Gateway Token / 支出份额
- Ornn GPU 租赁价格
- Epoch AI 数据中心建设数据
- npm / PyPI SDK 采用代理指标
- 公开新闻与研究信号

## 本地预览

```bash
python3 -m http.server 8000
```

打开 `http://localhost:8000/`。页面也支持直接双击打开，但本地服务器预览更接近部署环境。

## 刷新数据

```bash
python3 scripts/sync_tracker_data.py
```

同步脚本从公开 tracker 数据仓库下载生成后的 `data.js`，先检查字段完整性、JSON 格式和 SAMPLE 标记，再原子替换本地快照。任何下载或校验失败都会保留上一次成功数据。

GitHub Actions 默认每 6 小时检查一次上游更新。工作流会依次执行数据同步、真实 OpenRouter 刷新、校验、提交和 GitHub Pages 部署，因此即使数据没有变化，也会部署当前已验证版本。

### 使用自己的 OpenRouter API Key 直连官方数据

不要把 Key 写入 HTML。复制 `.env.local.example` 为 `.env.local`，填入重新生成的 Key，然后运行：

```bash
python3 scripts/refresh_openrouter.py
```

脚本调用 OpenRouter 官方 `rankings-daily` 数据集，成功后只替换 `data.js` 中的 OpenRouter 区块，并固定写入 `sample: false`。失败时不会覆盖已有数据。

若部署在 GitHub Pages，请在仓库的 `Settings → Secrets and variables → Actions` 中添加名为 `OPENROUTER_API_KEY` 的 Secret。定时任务会先同步其他数据，再使用该 Secret 直连刷新 OpenRouter。

在 `Settings → Pages → Build and deployment` 中，将 Source 设为 **GitHub Actions**。不要选择 `Deploy from a branch`，因为本项目由定时工作流直接上传并部署静态页面。

## 数据边界

ARR 属于基于公开检查点的模型估算，不是审计收入。OpenRouter 跨供应商 Token 口径并不完全一致。原站会员区的 ARR Nowcast 和 Compute Deals 没有包含在公开数据 bundle 中，本项目不会抓取或伪造这些字段。
