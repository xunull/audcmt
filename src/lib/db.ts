import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.audcmt');
const DB_PATH = path.join(DATA_DIR, 'audcmt.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    filename_display TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    original_content TEXT NOT NULL,
    translated_content TEXT,
    risk_level TEXT,
    network_ops TEXT,
    git_ops TEXT,
    telemetry TEXT,
    dangerous_patterns TEXT,
    risks TEXT,
    advice TEXT,
    truncated INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

export interface Audit {
  id: number;
  url: string;
  filename: string;
  filename_display: string;
  status: 'pending' | 'complete' | 'error';
  created_at: string;
  original_content: string;
  translated_content: string | null;
  risk_level: string | null;
  network_ops: string | null;
  git_ops: string | null;
  telemetry: string | null;
  dangerous_patterns: string | null;
  risks: string | null;
  advice: string | null;
  truncated: number;
}

export interface AuditSummary {
  risk_level: string;
  network_ops: NetworkOp[];
  git_ops: GitOp[];
  telemetry: TelemetryItem[];
  dangerous_patterns: DangerousPattern[];
  risks: string[];
  advice: string;
}

export interface NetworkOp {
  line: number;
  url: string;
  description: string;
}

export interface GitOp {
  line: number;
  cmd: string;
  target: string;
}

export interface TelemetryItem {
  line: number;
  code: string;
  description: string;
}

export interface DangerousPattern {
  line: number;
  pattern: string;
  description: string;
}

// Insert a pending audit record
export function createPendingAudit(
  url: string,
  filename: string,
  filenameDisplay: string,
  originalContent: string
): number {
  const stmt = db.prepare(`
    INSERT INTO audits (url, filename, filename_display, status, original_content)
    VALUES (?, ?, ?, 'pending', ?)
  `);
  const result = stmt.run(url, filename, filenameDisplay, originalContent);
  return result.lastInsertRowid as number;
}

// Update audit with results
export function updateAudit(
  id: number,
  data: {
    translatedContent?: string;
    riskLevel?: string;
    networkOps?: NetworkOp[];
    gitOps?: GitOp[];
    telemetry?: TelemetryItem[];
    dangerousPatterns?: DangerousPattern[];
    risks?: string[];
    advice?: string;
    truncated?: boolean;
    error?: string;
  }
): void {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.translatedContent !== undefined) {
    updates.push('translated_content = ?');
    values.push(data.translatedContent);
  }
  if (data.riskLevel !== undefined) {
    updates.push('risk_level = ?');
    values.push(data.riskLevel);
  }
  if (data.networkOps !== undefined) {
    updates.push('network_ops = ?');
    values.push(JSON.stringify(data.networkOps));
  }
  if (data.gitOps !== undefined) {
    updates.push('git_ops = ?');
    values.push(JSON.stringify(data.gitOps));
  }
  if (data.telemetry !== undefined) {
    updates.push('telemetry = ?');
    values.push(JSON.stringify(data.telemetry));
  }
  if (data.dangerousPatterns !== undefined) {
    updates.push('dangerous_patterns = ?');
    values.push(JSON.stringify(data.dangerousPatterns));
  }
  if (data.risks !== undefined) {
    updates.push('risks = ?');
    values.push(JSON.stringify(data.risks));
  }
  if (data.advice !== undefined) {
    updates.push('advice = ?');
    values.push(data.advice);
  }
  if (data.truncated !== undefined) {
    updates.push('truncated = ?');
    values.push(data.truncated ? 1 : 0);
  }

  // Set status based on whether we have an error
  updates.push('status = ?');
  values.push(data.error ? 'error' : 'complete');

  values.push(id);
  const stmt = db.prepare(`
    UPDATE audits SET ${updates.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);
}

// Get audit by ID
export function getAudit(id: number): Audit | undefined {
  const stmt = db.prepare('SELECT * FROM audits WHERE id = ?');
  return stmt.get(id) as Audit | undefined;
}

// Get paginated audits
export function getAudits(page: number = 1, limit: number = 20): Audit[] {
  const offset = (page - 1) * limit;
  // Ensure limit doesn't exceed 100
  limit = Math.min(limit, 100);
  const stmt = db.prepare(`
    SELECT * FROM audits ORDER BY created_at DESC LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as Audit[];
}

// Delete audit
export function deleteAudit(id: number): boolean {
  const stmt = db.prepare('DELETE FROM audits WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// Get total audit count
export function getAuditCount(): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM audits');
  const result = stmt.get() as { count: number };
  return result.count;
}

export default db;
