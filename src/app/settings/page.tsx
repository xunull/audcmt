'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Settings {
  apiUrl: string;
  model: string;
  configured: boolean;
  maxLines: number;
  headLines: number;
  tailLines: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    apiUrl: '',
    model: 'gpt-4o',
    configured: false,
    maxLines: 1500,
    headLines: 1000,
    tailLines: 300,
  });
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data);
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!settings.apiUrl || !apiKey || !settings.model) {
      setMessage({ type: 'error', text: '请填写所有字段' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: settings.apiUrl,
          apiKey,
          model: settings.model,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '连接测试成功！' });
      } else {
        setMessage({ type: 'error', text: `连接失败: ${data.error}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '测试失败，请检查网络' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    // 如果未配置或未输入 API Key，则不允许保存
    if (!settings.apiUrl || (!settings.configured && !apiKey) || !settings.model) {
      setMessage({ type: 'error', text: '请填写 API 相关字段' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: settings.apiUrl,
          apiKey: apiKey || undefined, // 空字符串表示不更新 API Key
          model: settings.model,
          maxLines: settings.maxLines,
          headLines: settings.headLines,
          tailLines: settings.tailLines,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '设置已保存！' });
        setSettings({ ...settings, configured: true });
        setApiKey('');
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: `保存失败: ${data.error}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '保存失败，请检查网络' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">🛡️ Script Auditor</h1>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-zinc-500">审计</Link>
            <Link href="/history" className="text-sm font-medium text-zinc-500">历史</Link>
            <Link href="/settings" className="text-sm font-medium text-zinc-900">设置</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">设置</h2>
        <p className="text-zinc-500 mb-8">配置 LLM API 以启用脚本审计功能</p>

        {settings.configured && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            ✓ API 已配置
          </div>
        )}

        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
          {/* API URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              API URL
            </label>
            <input
              type="url"
              value={settings.apiUrl}
              onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-sm text-zinc-400">
              支持 OpenAI、Claude 等兼容接口
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.configured ? '已保存，请输入新值以更新' : ''}
              className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-sm text-zinc-400">
              API Key 会安全存储在系统 Keychain 中
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              模型
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder="gpt-4o"
              className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-sm text-zinc-400">
              例如: gpt-4o, claude-sonnet-4-20250514
            </p>
          </div>

          {/* Script Line Limits */}
          <div className="pt-4 border-t border-zinc-200">
            <h3 className="text-sm font-medium text-zinc-700 mb-4">脚本截断设置</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  最大行数
                </label>
                <input
                  type="number"
                  value={settings.maxLines}
                  onChange={(e) => setSettings({ ...settings, maxLines: parseInt(e.target.value) || 1500 })}
                  min={100}
                  className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-sm text-zinc-400">
                  超过此行数则截断
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  保留开头行数
                </label>
                <input
                  type="number"
                  value={settings.headLines}
                  onChange={(e) => setSettings({ ...settings, headLines: parseInt(e.target.value) || 1000 })}
                  min={1}
                  className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-sm text-zinc-400">
                  截断时保留开头
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  保留结尾行数
                </label>
                <input
                  type="number"
                  value={settings.tailLines}
                  onChange={(e) => setSettings({ ...settings, tailLines: parseInt(e.target.value) || 300 })}
                  min={1}
                  className="w-full px-4 py-3 border-2 border-zinc-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-sm text-zinc-400">
                  截断时保留结尾
                </p>
              </div>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`px-4 py-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={handleTest}
              disabled={testing || !settings.apiUrl || !apiKey || !settings.model}
              className="px-6 py-3 border-2 border-zinc-200 font-medium rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !settings.apiUrl || (!settings.configured && !apiKey) || !settings.model}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
