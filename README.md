# audcmt

audcmt 是一个本地运行的脚本安全审计工具。它可以下载 GitHub raw 脚本，调用用户配置的 LLM 接口分析风险，并生成带中文注释的脚本阅读版本，方便在执行第三方 `install.sh`、`setup.sh` 之前快速判断它做了什么。

## 功能

- 输入脚本 URL 后自动下载脚本内容。
- 使用 LLM 分析网络请求、Git 操作、遥测代码和危险模式。
- 输出 `high`、`medium`、`low` 风险等级和可执行建议。
- 生成逐行中文注释后的脚本，并使用 CodeMirror 展示。
- 保存审计历史，支持分页查看和删除记录。
- 在设置页配置 OpenAI-compatible 或 Anthropic/Claude-compatible 接口。
- API Key 存储在系统 Keychain 中，非敏感设置和审计历史存储在本地 SQLite。
- 支持大脚本截断策略，可配置最大行数、保留开头行数和保留结尾行数。

## 技术栈

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- AI SDK
- better-sqlite3
- keytar
- CodeMirror
- Vitest

## 本地数据

应用会在当前系统用户目录下创建数据目录：

```text
~/.audcmt/audcmt.db
```

其中保存审计记录和非敏感设置。LLM API Key 不会写入 SQLite，而是通过 `keytar` 保存到系统 Keychain，服务名为 `audcmt`。

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

打开浏览器访问：

```text
http://localhost:3000
```

首次使用前，进入 `设置` 页面填写：

- API URL，例如 `https://api.openai.com/v1`
- API Key
- 模型名称，例如 `gpt-4o` 或 Claude 兼容接口对应的模型名
- 脚本截断参数

保存前可以点击 `测试连接` 验证接口是否可用。

## 使用流程

1. 打开首页 `审计`。
2. 粘贴 GitHub raw 脚本地址，例如：

   ```text
   https://raw.githubusercontent.com/user/repo/main/install.sh
   ```

3. 点击 `开始审计`。
4. 查看风险等级、网络操作、Git 操作、危险模式、遥测检测和总体建议。
5. 阅读带中文注释的脚本内容。
6. 在 `历史` 页面回看或删除审计记录。

## 可用脚本

```bash
npm run dev
```

启动开发服务器。

```bash
npm run build
```

构建生产版本。

```bash
npm run start
```

启动生产服务器。

```bash
npm run lint
```

运行 ESLint。

```bash
npm run test
npm run test:run
```

运行 Vitest 测试。

```bash
npm run mcp
```

以 stdio 方式启动 MCP server（一般由 Claude Code 按需拉起，不用手动跑）。

```bash
npm run mcp:install
```

把 audcmt 注册到 Claude Code 的全局配置 `~/.claude.json`。

## MCP 集成（Claude Code）

audcmt 提供一个 stdio MCP server，让 Claude Code 直接调用脚本审计能力，无需打开浏览器。它与 Web UI 共享同一个 `~/.audcmt/audcmt.db`，两边的审计历史互通。

### 安装

在项目根目录运行：

```bash
npm install
npm run mcp:install
```

`mcp:install` 会幂等地把下面这段写入 `~/.claude.json`（已有则更新 `cwd`，解析失败会中止并保留原文件，写入前自动备份到 `~/.claude.json.bak`）：

```json
{
  "mcpServers": {
    "audcmt": {
      "type": "stdio",
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/audcmt"
    }
  }
}
```

也可以手动把上面这段加到 `~/.claude.json`。注册后重启 Claude Code 即可。

> 使用前仍需先启动一次 Web 应用（`npm run dev`），在 `设置` 页配置好 LLM API URL、Key 和模型——MCP server 复用同一份配置（API Key 存在系统 Keychain）。

### 可用工具

| 工具 | 说明 |
|------|------|
| `audit_script(url)` | 下载并审计远程 https 脚本 |
| `audit_local_file(path)` | 审计本地脚本文件 |
| `check_risk_gate(url, maxRisk)` | 审计并判断风险是否超过阈值，返回 `pass` 布尔值 |
| `get_audit(id)` | 查询单条审计记录 |
| `list_audits(limit?)` | 列出最近的审计记录 |

### 可用资源

| 资源 URI | 说明 |
|---------|------|
| `audits://list` | 审计历史列表 |
| `audits://{id}` | 单条审计详情 |

## API 概览

### `POST /api/audit`

提交脚本 URL，下载脚本并调用 LLM 审计。

请求体：

```json
{
  "url": "https://raw.githubusercontent.com/user/repo/main/install.sh"
}
```

返回审计 ID、风险摘要、带中文注释的脚本和是否截断。

### `GET /api/audits`

分页获取审计历史。

查询参数：

- `page`：页码，默认 `1`
- `limit`：每页数量，默认 `20`，最大 `100`

### `GET /api/audits/:id`

获取单条审计记录详情。

### `DELETE /api/audits/:id`

删除单条审计记录。

### `GET /api/settings`

读取当前设置。返回值只包含是否已配置 API Key，不返回 API Key 明文。

### `PUT /api/settings`

保存 LLM 设置和截断策略。

### `POST /api/test-connection`

测试 LLM 接口连通性。

## LLM 输出约定

审计逻辑期望模型按以下结构返回：

```text
---ANALYSIS---
{
  "risk_level": "high|medium|low",
  "network_ops": [],
  "git_ops": [],
  "telemetry": [],
  "dangerous_patterns": [],
  "risks": [],
  "advice": ""
}
---SCRIPT---
# 带中文注释的脚本内容
```

如果模型没有严格按格式返回，应用会尽量保留可展示的脚本文本，并在风险提示中标记解析异常。

## 注意事项

- audcmt 用于辅助审计，不应替代人工安全判断。
- 请优先审计可信来源的 raw 脚本地址，不要把敏感私有脚本提交给不受信任的 LLM 服务。
- `keytar` 和 `better-sqlite3` 是服务端原生依赖，已通过 `next.config.ts` 配置为 server external packages。
- 当前应用会真实下载用户输入的 URL，请在受信任的本地环境中运行。
