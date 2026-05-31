import { describe, it, expect } from 'vitest';
import { formatAuditResult, looksBinary, riskGatePass } from './mcp-format';

const summary = {
  risk_level: 'high',
  network_ops: [{ line: 10, url: 'https://x.com/p.sh', description: '下载' }],
  git_ops: [{ line: 20, cmd: 'git clone', target: 'repo' }],
  telemetry: [{ line: 30, code: 'track()', description: '遥测' }],
  dangerous_patterns: [{ line: 5, pattern: 'curl | bash', description: '高危' }],
  risks: ['风险1'],
  advice: '不建议执行',
};

describe('riskGatePass', () => {
  it('风险等于阈值 → pass', () => {
    expect(riskGatePass('medium', 'medium')).toBe(true);
  });
  it('风险低于阈值 → pass', () => {
    expect(riskGatePass('low', 'high')).toBe(true);
  });
  it('风险高于阈值 → fail', () => {
    expect(riskGatePass('high', 'medium')).toBe(false);
  });
  it('未知风险等级按 medium 处理', () => {
    expect(riskGatePass('bogus', 'medium')).toBe(true);
    expect(riskGatePass('bogus', 'low')).toBe(false);
  });
});

describe('looksBinary', () => {
  it('含 NUL 字节 → 二进制', () => {
    expect(looksBinary(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
  });
  it('纯文本 → 非二进制', () => {
    expect(looksBinary(Buffer.from('echo hello\n', 'utf-8'))).toBe(false);
  });
});

describe('formatAuditResult', () => {
  it('包含风险等级、各操作分区、SCRIPT CONTENT 标签和尾部 JSON', () => {
    const out = formatAuditResult(summary, '# 注释\necho hi', false);
    expect(out).toContain('风险等级：HIGH ⚠️');
    expect(out).toContain('网络操作（1 处）');
    expect(out).toContain('危险模式（1 处）');
    expect(out).toContain('---SCRIPT CONTENT START---');
    expect(out).toContain('---SCRIPT CONTENT END---');
    expect(out).toContain('[完整 JSON]');
    // 尾部 JSON 可被解析
    const jsonPart = out.slice(out.indexOf('[完整 JSON]') + '[完整 JSON]'.length).trim();
    expect(JSON.parse(jsonPart).risk_level).toBe('high');
  });

  it('truncated 时标注已截断', () => {
    const out = formatAuditResult(summary, 'x', true);
    expect(out).toContain('已截断');
  });

  it('low 风险的风险等级行不带警告 emoji', () => {
    const out = formatAuditResult({ ...summary, risk_level: 'low' }, 'x', false);
    const riskLine = out.split('\n')[0];
    expect(riskLine).toBe('风险等级：LOW');
  });
});
