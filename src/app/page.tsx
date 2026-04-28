'use client';

import { useState } from 'react';
import Link from 'next/link';
import ScriptViewer from '@/components/ScriptViewer';
import AuditSummary from '@/components/AuditSummary';

interface AuditResult {
  id: number;
  summary: {
    risk_level: string;
    network_ops: Array<{ line: number; url: string; description: string }>;
    git_ops: Array<{ line: number; cmd: string; target: string }>;
    telemetry: Array<{ line: number; code: string; description: string }>;
    dangerous_patterns: Array<{ line: number; pattern: string; description: string }>;
    risks: string[];
    advice: string;
  };
  translated_script: string;
  truncated: boolean;
}

type ViewState = 'input' | 'loading' | 'result' | 'error';
type LoadingStatus = '下载中' | '下载完成' | '分析中' | '分析完成';

export default function Home() {
  const [url, setUrl] = useState('');
  const [viewState, setViewState] = useState<ViewState>('input');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>('下载中');

  const handleAudit = async () => {
    if (!url.trim()) return;

    setViewState('loading');
    setError(null);
    setLoadingStatus('分析中');

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({ code: data.code || 'UNKNOWN', message: data.error || '未知错误' });
        setViewState('error');
        return;
      }

      setLoadingStatus('分析完成');
      setResult(data);
      setViewState('result');
    } catch (e) {
      setError({ code: 'NETWORK', message: '网络错误，请重试' });
      setViewState('error');
    }
  };

  const handleReset = () => {
    setUrl('');
    setViewState('input');
    setResult(null);
    setError(null);
  };

  const riskLevel = result?.summary.risk_level || 'medium';
  const riskColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };
  const riskLabels: Record<string, string> = {
    high: '高风险',
    medium: '中等风险',
    low: '低风险',
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">🛡️ Script Auditor</h1>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-zinc-900">审计</Link>
            <Link href="/history" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">历史</Link>
            <Link href="/settings" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">设置</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Input Section */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-zinc-900 mb-2">输入脚本 URL</h2>
          <p className="text-zinc-500 mb-6">粘贴 GitHub 上任意 install.sh 或 setup.sh 的 raw 地址</p>

          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
              placeholder="https://raw.githubusercontent.com/user/repo/main/install.sh"
              disabled={viewState === 'loading'}
              className="flex-1 px-4 py-3 text-lg border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none disabled:bg-zinc-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleAudit}
              disabled={viewState === 'loading' || !url.trim()}
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
            >
              {viewState === 'loading' ? '审计中...' : '开始审计'}
            </button>
          </div>
        </section>

        {/* Loading State */}
        {viewState === 'loading' && (
          <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-zinc-500 mb-4">正在下载脚本并分析，请稍候...</p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className={loadingStatus === '分析中' ? 'text-blue-600 font-medium' : 'text-green-600 font-medium'}>
                {loadingStatus === '分析中' && '○'}
                {loadingStatus === '分析完成' && '●'}
                {' '}AI 分析中
              </span>
            </div>
          </div>
        )}

        {/* Error State */}
        {viewState === 'error' && error && (
          <div className="bg-white rounded-xl border border-red-200 p-8">
            <div className="flex items-start gap-4">
              <div className="text-4xl">❌</div>
              <div>
                <h3 className="text-lg font-semibold text-red-700 mb-1">审计失败</h3>
                <p className="text-zinc-600 mb-2">{error.message}</p>
                <p className="text-sm text-zinc-400">错误码: {error.code}</p>
                <button
                  onClick={handleReset}
                  className="mt-4 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result State */}
        {viewState === 'result' && result && (
          <div className="space-y-6">
            {/* Summary Header */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900">审计结果</h3>
                <div className={`px-3 py-1 rounded-full text-sm font-medium border ${riskColors[riskLevel]}`}>
                  {riskLabels[riskLevel]}
                </div>
              </div>

              <AuditSummary summary={result.summary} />
            </div>

            {/* Translated Script */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-zinc-50 border-b border-zinc-200">
                <h3 className="font-semibold text-zinc-900">翻译后的脚本</h3>
                <button
                  onClick={() => navigator.clipboard.writeText(result.translated_script)}
                  className="px-4 py-2 text-sm bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  复制全部
                </button>
              </div>
              <div className="max-h-[600px] overflow-auto">
                <ScriptViewer content={result.translated_script} />
              </div>
              {result.truncated && (
                <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100 text-sm text-yellow-700">
                  ⚠️ 脚本过长，已截断处理
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-4 justify-end">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-zinc-100 text-zinc-700 font-medium rounded-lg hover:bg-zinc-200 transition-colors"
              >
                审计新脚本
              </button>
              <Link
                href="/history"
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                查看历史
              </Link>
            </div>
          </div>
        )}

        {/* Empty/Input State */}
        {viewState === 'input' && (
          <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-zinc-500">
              输入上面的 URL 开始审计
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
