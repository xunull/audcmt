import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { AuditSummary, NetworkOp, GitOp, TelemetryItem, DangerousPattern } from './db';

const SYSTEM_PROMPT = `你是一个脚本安全审计专家。你会收到一个 shell 脚本，你的任务是：
1. 分析脚本的安全风险
2. 尽力做到在原始脚本的每一行上方添加详细的中文注释

输出格式：
---ANALYSIS---
{
  "risk_level": "high|medium|low",
  "network_ops": [
    {"line": 15, "url": "https://...", "description": "下载安装包"}
  ],
  "git_ops": [
    {"line": 23, "cmd": "git clone", "target": "..."}
  ],
  "telemetry": [
    {"line": 30, "code": "analytics.track", "description": "遥测代码"}
  ],
  "dangerous_patterns": [
    {"line": 10, "pattern": "curl | bash", "description": "远程脚本直接管道执行，高危！"}
  ],
  "risks": ["风险点1", "风险点2"],
  "advice": "是否建议执行的总体建议"
}
---SCRIPT---
# 下面是带注释的脚本（保持原始行号，只添加注释）：
[逐行带中文注释的脚本内容]`;

export interface LLMResult {
  summary: AuditSummary;
  translatedScript: string;
  truncated: boolean;
}

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxLines?: number;
  headLines?: number;
  tailLines?: number;
}

export async function analyzeScript(
  content: string,
  config: LLMConfig,
  _signal?: AbortSignal
): Promise<LLMResult> {
  const MAX_LINES = config.maxLines ?? 1500;
  const HEAD_LINES = config.headLines ?? 1000;
  const TAIL_LINES = config.tailLines ?? 300;

  const lines = content.split('\n');
  const totalLines = lines.length;
  const truncated = totalLines > MAX_LINES;
  const truncatedContent = truncated
    ? lines.slice(0, HEAD_LINES).join('\n') + '\n# ... (脚本过长，已截断，原始共 ' + totalLines + ' 行) ...\n' + lines.slice(-TAIL_LINES).join('\n')
    : content;

  let text: string;

  if (config.apiUrl.includes('anthropic') || config.apiUrl.includes('claude')) {
    const anthropic = createAnthropic({ apiKey: config.apiKey, baseURL: config.apiUrl });

    const result = await generateText({
      model: anthropic(config.model),
      system: SYSTEM_PROMPT,
      prompt: `请分析并注释以下脚本：\n\`\`\`bash\n${truncatedContent}\n\`\`\``,
      temperature: 0.3,
      maxRetries: 2,
    });

    text = result.text;
  } else {
    // Default to OpenAI-compatible
    const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.apiUrl });

    const result = await generateText({
      model: openai.chat(config.model),
      system: SYSTEM_PROMPT,
      prompt: `请分析并注释以下脚本：\n\`\`\`bash\n${truncatedContent}\n\`\`\``,
      temperature: 0.3,
      maxRetries: 2,
    });

    text = result.text;
  }

  return parseLLMResponse(text, truncated);
}

function parseLLMResponse(text: string, truncated: boolean): LLMResult {
  let summary: AuditSummary = {
    risk_level: 'medium',
    network_ops: [],
    git_ops: [],
    telemetry: [],
    dangerous_patterns: [],
    risks: [],
    advice: '无法解析 LLM 返回，请重试',
  };

  let translatedScript = '';
  let parseFailed = false;

  try {
    // Extract JSON from ---ANALYSIS--- block
    const analysisMatch = text.match(/---ANALYSIS---\s*([\s\S]*?)\s*---SCRIPT---/);
    const scriptMatch = text.match(/---SCRIPT---\s*([\s\S]*?)$/);

    if (analysisMatch && analysisMatch[1]) {
      const jsonStr = analysisMatch[1].trim();
      const parsed = JSON.parse(jsonStr);

      summary = {
        risk_level: parsed.risk_level || 'medium',
        network_ops: parsed.network_ops || [],
        git_ops: parsed.git_ops || [],
        telemetry: parsed.telemetry || [],
        dangerous_patterns: parsed.dangerous_patterns || [],
        risks: parsed.risks || [],
        advice: parsed.advice || '',
      };
    }

    if (scriptMatch && scriptMatch[1]) {
      translatedScript = scriptMatch[1].trim();
    } else {
      // If we can't find the structured output, use the entire text as the script
      const withoutAnalysis = text.replace(/---ANALYSIS---[\s\S]*?---SCRIPT---\s*/, '');
      if (withoutAnalysis.trim()) {
        translatedScript = withoutAnalysis.trim();
      } else {
        parseFailed = true;
      }
    }
  } catch (e) {
    console.error('Failed to parse LLM response:', e);
    const withoutAnalysis = text.replace(/---ANALYSIS---[\s\S]*?---SCRIPT---\s*/, '');
    if (withoutAnalysis.trim()) {
      translatedScript = withoutAnalysis.trim();
    } else {
      parseFailed = true;
    }
  }

  if (parseFailed) {
    translatedScript = text;
    summary.risks = [...(summary.risks || []), 'LLM 返回格式异常，分析结果可能不完整'];
  }

  return {
    summary,
    translatedScript,
    truncated,
  };
}

// Test connection to LLM API
export async function testConnection(config: LLMConfig): Promise<{ success: boolean; error?: string }> {
  try {
    if (config.apiUrl.includes('anthropic') || config.apiUrl.includes('claude')) {
      const anthropic = createAnthropic({ apiKey: config.apiKey, baseURL: config.apiUrl });

      await generateText({
        model: anthropic(config.model),
        prompt: 'Reply with just "OK" to confirm the connection works.',
      });
    } else {
      const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.apiUrl });

      await generateText({
        model: openai.chat(config.model),
        prompt: 'Reply with just "OK" to confirm the connection works.',
      });
    }

    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error };
  }
}