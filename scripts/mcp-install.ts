#!/usr/bin/env node
/**
 * 将 audcmt MCP server 注册到 Claude Code 的全局配置 ~/.claude.json。
 *
 * ⚠️ blast radius：~/.claude.json 是用户整个 Claude Code 配置（所有 MCP
 * server、项目历史等）。本脚本绝不能损坏它。安全策略：
 *   1. 解析失败 → 立即中止，不覆盖
 *   2. 写入前备份到 ~/.claude.json.bak
 *   3. 原子写入：先写临时文件再 rename
 *   4. 幂等：已有 audcmt 条目则更新 cwd，否则插入
 *
 * 用法：npm run mcp:install
 */
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'fs';
import path from 'path';
import os from 'os';

interface McpEntry {
  type: string;
  command: string;
  args: string[];
  cwd: string;
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpEntry>;
  [key: string]: unknown;
}

const CONFIG_PATH = path.join(os.homedir(), '.claude.json');

export function buildEntry(repoRoot: string): McpEntry {
  return {
    type: 'stdio',
    command: 'npm',
    args: ['run', 'mcp'],
    cwd: repoRoot,
  };
}

/**
 * 纯函数：在已有配置对象上 upsert audcmt 条目，返回新配置。
 * 抽出来便于测试（不碰文件系统）。
 */
export function upsertAudcmt(config: ClaudeConfig, entry: McpEntry): ClaudeConfig {
  const next: ClaudeConfig = { ...config };
  next.mcpServers = { ...(config.mcpServers ?? {}), audcmt: entry };
  return next;
}

export function install(configPath: string = CONFIG_PATH, repoRoot: string = process.cwd()): void {
  let config: ClaudeConfig = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    if (raw.trim()) {
      try {
        config = JSON.parse(raw);
      } catch (e) {
        // 解析失败：中止，绝不覆盖
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `无法解析 ${configPath}（${msg}）。为避免损坏配置，已中止。请手动检查该文件。`
        );
      }
    }
    // 备份现有配置
    copyFileSync(configPath, `${configPath}.bak`);
  }

  const next = upsertAudcmt(config, buildEntry(repoRoot));

  // 原子写入：临时文件 + rename
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, configPath);
}

// 仅在直接运行时执行（被测试 import 时不执行）
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  try {
    install();
    console.log(`✅ audcmt MCP 已注册到 Claude Code：${CONFIG_PATH}`);
    console.log('   重启 Claude Code 后即可使用 audit_script 等工具。');
    if (existsSync(`${CONFIG_PATH}.bak`)) {
      console.log(`   原配置已备份到 ${CONFIG_PATH}.bak`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ 安装失败：${msg}`);
    process.exit(1);
  }
}
