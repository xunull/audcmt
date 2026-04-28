import db from './db';
import keytar from 'keytar';

const SERVICE_NAME = 'audcmt';
const API_KEY_KEY = 'api_key';

export interface AppSettings {
  apiUrl: string;
  apiKey?: string;
  model: string;
  maxLines: number;
  headLines: number;
  tailLines: number;
}

// Get settings (api key is retrieved from keychain)
export function getSettings(): AppSettings {
  const stmt = db.prepare('SELECT key, value FROM settings');
  const rows = stmt.all() as Array<{ key: string; value: string }>;

  const settings: AppSettings = {
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o',
    maxLines: 1500,
    headLines: 1000,
    tailLines: 300,
  };

  for (const row of rows) {
    if (row.key === 'api_url') {
      settings.apiUrl = row.value;
    } else if (row.key === 'model') {
      settings.model = row.value;
    } else if (row.key === 'max_lines') {
      settings.maxLines = parseInt(row.value, 10) || 1500;
    } else if (row.key === 'head_lines') {
      settings.headLines = parseInt(row.value, 10) || 1000;
    } else if (row.key === 'tail_lines') {
      settings.tailLines = parseInt(row.value, 10) || 300;
    }
  }

  return settings;
}

// Save settings (api key is stored in keychain)
export async function saveSettings(settings: AppSettings): Promise<void> {
  // Save non-sensitive settings to SQLite
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const saveNonKey = db.transaction(() => {
    upsert.run('api_url', settings.apiUrl);
    upsert.run('model', settings.model);
    upsert.run('max_lines', settings.maxLines.toString());
    upsert.run('head_lines', settings.headLines.toString());
    upsert.run('tail_lines', settings.tailLines.toString());
  });

  saveNonKey();

  // Save API key to keychain
  if (settings.apiKey) {
    await keytar.setPassword(SERVICE_NAME, API_KEY_KEY, settings.apiKey);
  }
}

// Get API key from keychain
export async function getApiKey(): Promise<string | null> {
  return await keytar.getPassword(SERVICE_NAME, API_KEY_KEY);
}

// Delete API key from keychain
export async function deleteApiKey(): Promise<boolean> {
  return await keytar.deletePassword(SERVICE_NAME, API_KEY_KEY);
}

// Check if settings are configured (has api url and key)
export async function isConfigured(): Promise<boolean> {
  const settings = getSettings();
  const apiKey = await getApiKey();
  return !!(settings.apiUrl && apiKey);
}
