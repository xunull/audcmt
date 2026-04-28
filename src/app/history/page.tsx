'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Audit {
  id: number;
  url: string;
  filename: string;
  filename_display: string;
  status: string;
  created_at: string;
  risk_level: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function HistoryPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const router = useRouter();

  const fetchAudits = async (page: number = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/audits?page=${page}`);
      const data = await response.json();
      setAudits(data.audits || []);
      setPagination(data.pagination);
    } catch (e) {
      console.error('Failed to fetch audits:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/audits/${id}`, { method: 'DELETE' });
      setAudits(audits.filter(a => a.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const riskColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };

  const riskLabels: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">🛡️ Script Auditor</h1>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-zinc-500">审计</Link>
            <Link href="/history" className="text-sm font-medium text-zinc-900">历史</Link>
            <Link href="/settings" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">设置</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-6">审计历史</h2>

        {loading ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-zinc-500">加载中...</p>
          </div>
        ) : audits.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-zinc-500 mb-4">还没有审计记录</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              去审计第一个脚本
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              {audits.map((audit, index) => (
                <div
                  key={audit.id}
                  className={`flex items-center gap-4 px-6 py-4 ${
                    index !== audits.length - 1 ? 'border-b border-zinc-200' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-medium text-zinc-900 truncate">
                        {audit.filename_display || audit.filename}
                      </h3>
                      {audit.risk_level && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riskColors[audit.risk_level]}`}>
                          {riskLabels[audit.risk_level]}风险
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 truncate">{audit.url}</p>
                  </div>
                  <div className="text-sm text-zinc-400 whitespace-nowrap">
                    {formatDate(audit.created_at)}
                  </div>
                  <div className="flex gap-2">
                    {deleteConfirm === audit.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(audit.id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1 text-sm bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(audit.id)}
                        className="px-3 py-1 text-sm bg-zinc-100 text-zinc-700 rounded hover:bg-red-50 hover:text-red-600"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => fetchAudits(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-4 py-2 bg-white border border-zinc-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
                >
                  上一页
                </button>
                <span className="text-sm text-zinc-500">
                  第 {pagination.page} / {pagination.totalPages} 页
                </span>
                <button
                  onClick={() => fetchAudits(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-4 py-2 bg-white border border-zinc-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
