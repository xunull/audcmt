import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { upsertAudcmt, buildEntry, install } from '../../scripts/mcp-install';

describe('upsertAudcmt (纯函数)', () => {
  const entry = buildEntry('/repo/audcmt');

  it('空配置 → 插入 audcmt', () => {
    const out = upsertAudcmt({}, entry);
    expect(out.mcpServers?.audcmt).toEqual(entry);
  });

  it('保留其他 mcpServers 条目', () => {
    const out = upsertAudcmt({ mcpServers: { other: { type: 'stdio', command: 'x', args: [], cwd: '/' } } }, entry);
    expect(out.mcpServers?.other).toBeDefined();
    expect(out.mcpServers?.audcmt).toEqual(entry);
  });

  it('幂等：已有 audcmt 则更新 cwd', () => {
    const old = buildEntry('/old/path');
    const out = upsertAudcmt({ mcpServers: { audcmt: old } }, entry);
    expect(out.mcpServers?.audcmt.cwd).toBe('/repo/audcmt');
  });

  it('保留顶层非 mcpServers 字段', () => {
    const out = upsertAudcmt({ someOtherKey: 'keep-me' }, entry);
    expect(out.someOtherKey).toBe('keep-me');
  });
});

describe('install (文件系统)', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'audcmt-install-'));
    configPath = path.join(dir, '.claude.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('配置不存在 → 新建并写入 audcmt', () => {
    install(configPath, '/repo/audcmt');
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.mcpServers.audcmt.cwd).toBe('/repo/audcmt');
  });

  it('已有有效配置 → 备份 .bak 且保留原有内容', () => {
    writeFileSync(configPath, JSON.stringify({ mcpServers: { foo: { type: 'stdio', command: 'a', args: [], cwd: '/' } } }));
    install(configPath, '/repo/audcmt');
    expect(existsSync(`${configPath}.bak`)).toBe(true);
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.mcpServers.foo).toBeDefined();
    expect(written.mcpServers.audcmt).toBeDefined();
  });

  it('幂等：重复运行不产生重复条目', () => {
    install(configPath, '/repo/audcmt');
    install(configPath, '/repo/audcmt2');
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(Object.keys(written.mcpServers)).toEqual(['audcmt']);
    expect(written.mcpServers.audcmt.cwd).toBe('/repo/audcmt2');
  });

  // CRITICAL：解析失败绝不能覆盖现有配置
  it('[CRITICAL] 配置解析失败 → 抛错且不修改原文件', () => {
    const garbage = '{ this is not valid json ;;;';
    writeFileSync(configPath, garbage);
    expect(() => install(configPath, '/repo/audcmt')).toThrow(/无法解析/);
    // 原文件原封不动
    expect(readFileSync(configPath, 'utf-8')).toBe(garbage);
  });
});
