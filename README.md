# opencode-go-quota

DSH 插件：把 OpenCode Go 套餐余量和刷新时间显示在输入框下方、会话统计行（`2 轮 · 147 步 | LLM ...`）底部。

## 功能

- 在「设置 → OpenCode Go 余量」中填写 API Key
- 本地保存 Key，DSH 重启后自动从 localStorage 恢复并同步给宿主
- 宿主轮询官方接口 `GET https://opencode.ai/zen/go/v1/usage`
- 在 `conversation.composer.dock` 用进度条显示 5 小时 / 周 / 月余量百分比、重置时间、上次刷新时间
- 支持手动测试连接、清除 Key

## 安装

```bash
dsh plugin --profile web add github:JayhaShf/dsh-opencode-go-quota#<sha>
```

其中 `<sha>` 为本仓库提交哈希。

## 开发

```bash
pnpm install
dsh plugin --profile web add .
```

## 接口

- `GET /ocgo-quota/status` — 当前状态
- `POST /ocgo-quota/config` — 保存配置
- `POST /ocgo-quota/refresh` — 手动刷新
- `POST /ocgo-quota/test` — 测试连接
