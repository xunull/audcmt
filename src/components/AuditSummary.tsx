interface Summary {
  risk_level: string;
  network_ops: Array<{ line: number; url: string; description: string }>;
  git_ops: Array<{ line: number; cmd: string; target: string }>;
  telemetry: Array<{ line: number; code: string; description: string }>;
  dangerous_patterns: Array<{ line: number; pattern: string; description: string }>;
  risks: string[];
  advice: string;
}

interface AuditSummaryProps {
  summary: Summary;
}

export default function AuditSummary({ summary }: AuditSummaryProps) {
  const hasNetworkOps = summary.network_ops && summary.network_ops.length > 0;
  const hasGitOps = summary.git_ops && summary.git_ops.length > 0;
  const hasTelemetry = summary.telemetry && summary.telemetry.length > 0;
  const hasDangerousPatterns = summary.dangerous_patterns && summary.dangerous_patterns.length > 0;
  const hasRisks = summary.risks && summary.risks.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Network Operations */}
      <div>
        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
          🌐 网络操作
        </h4>
        {hasNetworkOps ? (
          <ul className="space-y-2">
            {summary.network_ops.map((op, i) => (
              <li key={i} className="text-sm">
                <a
                  href={op.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  行 {op.line}: {op.url}
                </a>
                <p className="text-zinc-500">{op.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">未检测到网络操作</p>
        )}
      </div>

      {/* Git Operations */}
      <div>
        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
          📦 Git 操作
        </h4>
        {hasGitOps ? (
          <ul className="space-y-2">
            {summary.git_ops.map((op, i) => (
              <li key={i} className="text-sm">
                <span className="text-zinc-700">
                  行 {op.line}: <code className="bg-zinc-100 px-1 rounded">{op.cmd}</code>
                </span>
                <p className="text-zinc-500">{op.target}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">未检测到 Git 操作</p>
        )}
      </div>

      {/* Dangerous Patterns */}
      {hasDangerousPatterns && (
        <div className="md:col-span-2">
          <h4 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-2">
            ⚠️ 危险模式
          </h4>
          <ul className="space-y-2 bg-red-50 border border-red-200 rounded-lg p-4">
            {summary.dangerous_patterns.map((dp, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-red-600 font-medium">行 {dp.line}:</span>
                <div>
                  <code className="bg-red-100 text-red-700 px-1 rounded">{dp.pattern}</code>
                  <p className="text-red-600 mt-1">{dp.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Telemetry */}
      <div>
        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
          📊 遥测检测
        </h4>
        {hasTelemetry ? (
          <ul className="space-y-2">
            {summary.telemetry.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="text-zinc-700">
                  行 {t.line}: <code className="bg-zinc-100 px-1 rounded">{t.code}</code>
                </span>
                <p className="text-zinc-500">{t.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-green-600">✓ 未检测到遥测代码</p>
        )}
      </div>

      {/* Risks */}
      <div>
        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
          🔍 风险提示
        </h4>
        {hasRisks ? (
          <ul className="space-y-1">
            {summary.risks.map((risk, i) => (
              <li key={i} className="text-sm text-zinc-700">• {risk}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">未发现明显风险</p>
        )}
      </div>

      {/* Advice */}
      {summary.advice && (
        <div className="md:col-span-2">
          <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
            💡 审计建议
          </h4>
          <p className="text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
            {summary.advice}
          </p>
        </div>
      )}
    </div>
  );
}
