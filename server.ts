import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_GAMES,
  DEFAULT_PROFILE,
  DEFAULT_SYNC_INFO,
  SEED_RECORDS,
} from './src/data/seedData';
import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  GameItem,
  SpreadsheetSyncInfo,
  TeacherProfile,
} from './src/shared/categories';
import {
  AppsScriptPullRaw,
  buildAppsScriptPayload,
  buildExcelWorkbookXml,
  buildPublicDocumentHtml,
  formatRecordsToCsv,
  isValidAppsScriptUrl,
  normalizeExternalPhotoUrl,
  normalizeGameItem,
  normalizeRecordForCategory,
  parseAppsScriptResponse,
  parseCsvToRecords,
  validateDocumentInput,
  validateGameInput,
} from './src/shared/spreadsheet';

interface DatabaseState {
  profile: TeacherProfile;
  records: AdminRecord[];
  games: GameItem[];
  syncInfo: SpreadsheetSyncInfo;
}

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = 'gpai';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'misbah5758';
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'gpai-portal-spreadsheet-secret-key-2026';
const SESSION_COOKIE = 'gpai_admin_session';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'gpai-database.json');

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseState = {
      profile: DEFAULT_PROFILE,
      records: SEED_RECORDS,
      games: DEFAULT_GAMES,
      syncInfo: DEFAULT_SYNC_INFO,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

const ENV_APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL || '').trim();
let lastRemotePullAt = 0;
const REMOTE_PULL_TTL_MS = 10000;

function readDb(): DatabaseState {
  ensureStorage();
  const fallbackScriptUrl = isValidAppsScriptUrl(ENV_APPS_SCRIPT_URL)
    ? ENV_APPS_SCRIPT_URL
    : null;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseState;
    return {
      profile: parsed.profile || DEFAULT_PROFILE,
      records: Array.isArray(parsed.records) ? parsed.records : SEED_RECORDS,
      games: Array.isArray(parsed.games) ? parsed.games : DEFAULT_GAMES,
      syncInfo: {
        ...DEFAULT_SYNC_INFO,
        ...(parsed.syncInfo || {}),
        appsScriptUrl: parsed.syncInfo?.appsScriptUrl || fallbackScriptUrl,
      },
    };
  } catch {
    return {
      profile: DEFAULT_PROFILE,
      records: SEED_RECORDS,
      games: DEFAULT_GAMES,
      syncInfo: {
        ...DEFAULT_SYNC_INFO,
        appsScriptUrl: fallbackScriptUrl,
      },
    };
  }
}

async function pullFromAppsScript(
  url: string,
  currentState: DatabaseState
): Promise<{
  ok: boolean;
  state: DatabaseState;
  message: string;
  needsDoGetUpdate?: boolean;
}> {
  if (!isValidAppsScriptUrl(url)) {
    return {
      ok: false,
      state: currentState,
      message: 'URL Apps Script tidak valid.',
    };
  }

  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(
      `${url.trim()}${separator}action=getAll&_t=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      }
    );
    const rawText = await response.text();
    const trimmed = rawText.trim();

    if (
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      rawText.includes('accounts.google.com')
    ) {
      const missingDoGet = rawText.includes('doGet');
      return {
        ok: false,
        state: currentState,
        needsDoGetUpdate: missingDoGet,
        message: missingDoGet
          ? 'Apps Script belum memiliki fungsi doGet(e). Salin kode terbaru Code.gs lalu Deploy New Version agar semua perangkat otomatis sinkron.'
          : 'Apps Script meminta otorisasi login. Pastikan Deployment Web App diatur ke "Anyone / Siapa saja".',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        state: currentState,
        message: `Apps Script GET merespons status HTTP ${response.status}.`,
      };
    }

    const json = JSON.parse(rawText) as AppsScriptPullRaw;
    if (json.ok === false) {
      return {
        ok: false,
        state: currentState,
        message: json.error || 'Apps Script mengembalikan error saat membaca data.',
      };
    }

    const parsed = parseAppsScriptResponse(json, currentState.profile);
    if (!parsed.hasRemoteData) {
      return {
        ok: true,
        state: currentState,
        message: 'Spreadsheet belum berisi tab data; data lokal dipertahankan.',
      };
    }

    const nextState: DatabaseState = {
      ...currentState,
      profile: parsed.profile,
      records: parsed.records.length > 0 ? parsed.records : currentState.records,
      games: parsed.games.length > 0 ? parsed.games : currentState.games,
      syncInfo: {
        ...currentState.syncInfo,
        appsScriptUrl: url.trim(),
        lastSyncedAt: new Date().toISOString(),
      },
    };
    writeDb(nextState);
    lastRemotePullAt = Date.now();
    return {
      ok: true,
      state: nextState,
      message: `Berhasil menarik ${nextState.records.length} baris data, ${nextState.games.length} game, & profil guru dari Google Spreadsheet.`,
    };
  } catch (err) {
    return {
      ok: false,
      state: currentState,
      message:
        err instanceof Error
          ? `Gagal mengambil data dari Apps Script: ${err.message}`
          : 'Gagal mengambil data dari Apps Script.',
    };
  }
}

async function pushToAppsScript(
  url: string,
  state: DatabaseState,
  onlyCategoryId?: CategoryId
): Promise<{ ok: boolean; message: string }> {
  if (!isValidAppsScriptUrl(url)) {
    return {
      ok: false,
      message:
        'URL Apps Script tidak valid. Gunakan URL Web App https://script.google.com/macros/s/.../exec',
    };
  }

  const payload = buildAppsScriptPayload(
    state.profile,
    state.records,
    onlyCategoryId,
    state.games
  );

  try {
    const response = await fetch(url.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const rawText = await response.text();
    const looksLikeHtmlLogin =
      rawText.trim().startsWith('<!DOCTYPE') ||
      rawText.includes('accounts.google.com');

    if (looksLikeHtmlLogin) {
      return {
        ok: false,
        message:
          'Google Apps Script meminta login Google. Pastikan saat Deploy Web App opsi "Who has access / Yang memiliki akses" diatur ke "Anyone / Siapa saja".',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `Apps Script merespons status HTTP ${response.status}.`,
      };
    }

    try {
      const parsed = JSON.parse(rawText) as { ok?: boolean; error?: string };
      if (parsed.ok === false) {
        return {
          ok: false,
          message: parsed.error || 'Skrip Apps Script mengembalikan status gagal.',
        };
      }
    } catch {
      // Plain text 200 OK response from custom Apps Script is also valid
    }

    return {
      ok: true,
      message: 'Data berhasil disinkronkan ke Google Apps Script.',
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Gagal menghubungi URL Apps Script: ${err.message}`
          : 'Gagal menghubungi URL Apps Script.',
    };
  }
}

function writeDb(state: DatabaseState): void {
  ensureStorage();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

function signSession(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      u: string;
      exp: number;
    };
    if (decoded.exp < Date.now()) return null;
    return decoded.u;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    cookies[k] = decodeURIComponent(v);
  }
  return cookies;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req);
  const user = verifySession(cookies[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: 'Sesi admin tidak valid atau telah berakhir. Silakan login kembali.' });
    return;
  }
  next();
}

function saveBase64Upload(
  originalName: string,
  base64Data: string
): { fileName: string; fileUrl: string; fileSize: string } {
  ensureStorage();
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const safeBaseName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${safeBaseName}`;
  const destPath = path.join(UPLOADS_DIR, uniqueName);
  fs.writeFileSync(destPath, buffer);

  const sizeKb = buffer.length / 1024;
  const fileSize =
    sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(sizeKb))} KB`;

  return {
    fileName: originalName,
    fileUrl: `/api/files/${encodeURIComponent(uniqueName)}`,
    fileSize,
  };
}

async function startServer(): Promise<void> {
  ensureStorage();
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Auth endpoints
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const cleanUser = (username || '').trim();
    const cleanPass = password || '';

    const userMatch = cleanUser === ADMIN_USERNAME;
    const passMatch = cleanPass === ADMIN_PASSWORD;
    if (!userMatch || !passMatch) {
      res.status(401).json({
        error: 'Username atau password admin salah. Gunakan kredensial resmi admin GPAI.',
      });
      return;
    }

    const token = signSession(ADMIN_USERNAME);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ authenticated: true, username: ADMIN_USERNAME });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const user = verifySession(cookies[SESSION_COOKIE]);
    res.json({ authenticated: Boolean(user), username: user });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ authenticated: false });
  });

  // Public portal data (no-store so every device always sees latest DB state)
  app.get('/api/portal', async (req: Request, res: Response) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    let db = readDb();
    const forceRefresh = req.query.refresh === '1';
    const remoteUrl = db.syncInfo.appsScriptUrl;
    if (
      remoteUrl &&
      isValidAppsScriptUrl(remoteUrl) &&
      db.syncInfo.autoSyncEnabled &&
      (forceRefresh || Date.now() - lastRemotePullAt > REMOTE_PULL_TTL_MS)
    ) {
      lastRemotePullAt = Date.now();
      const pulled = await pullFromAppsScript(remoteUrl, db);
      if (pulled.ok) {
        db = pulled.state;
      }
    }
    res.json(db);
  });

  // Uploaded files serving
  app.get('/api/files/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Berkas tidak ditemukan.' });
      return;
    }
    res.sendFile(fullPath);
  });

  // Public printable/downloadable document sheet for any record
  app.get('/api/public/document/:id', (req: Request, res: Response) => {
    const db = readDb();
    const record = db.records.find((r) => r.id === req.params.id);
    if (!record) {
      res.status(404).send('Dokumen tidak ditemukan.');
      return;
    }
    const html = buildPublicDocumentHtml(record, db.profile);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.query.download === '1') {
      const safeFile = (record.fileName || record.codeOrRef || record.id).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFile}.html"`);
    }
    res.send(html);
  });

  // CSV & Multi-tab Spreadsheet exports
  app.get('/api/export/csv/:categoryId', (req: Request, res: Response) => {
    const categoryId = req.params.categoryId as CategoryId;
    const config = CATEGORY_MAP[categoryId];
    if (!config) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const db = readDb();
    const filtered = db.records.filter((r) => r.categoryId === categoryId);
    const csv = `\uFEFF${formatRecordsToCsv(categoryId, filtered)}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${config.sheetTabName}.csv"`
    );
    res.send(csv);
  });

  app.get('/api/export/workbook', (_req: Request, res: Response) => {
    const db = readDb();
    const xml = buildExcelWorkbookXml(db.records);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Database_Administrasi_GPAI_9_Kategori.xls"'
    );
    res.send(xml);
  });

  // Protected Admin Routes
  app.put('/api/admin/profile', requireAdmin, async (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as Partial<TeacherProfile> & {
      photoUpload?: { fileName: string; base64Data: string };
    };

    if (!body.fullName || !body.fullName.trim()) {
      res.status(400).json({ error: 'Nama lengkap guru wajib diisi.' });
      return;
    }

    let nextPhotoUrl = body.photoUrl
      ? normalizeExternalPhotoUrl(body.photoUrl)
      : db.profile.photoUrl;
    if (body.photoUpload?.base64Data && body.photoUpload?.fileName) {
      if (
        body.photoUpload.base64Data.startsWith('data:image/') &&
        body.photoUpload.base64Data.length <= 45000
      ) {
        nextPhotoUrl = body.photoUpload.base64Data;
      } else {
        const saved = saveBase64Upload(
          body.photoUpload.fileName,
          body.photoUpload.base64Data
        );
        nextPhotoUrl = saved.fileUrl;
      }
    }

    const updatedProfile: TeacherProfile = {
      ...db.profile,
      fullName: body.fullName.trim(),
      titleRole: (body.titleRole ?? db.profile.titleRole).trim(),
      schoolName: (body.schoolName ?? db.profile.schoolName).trim(),
      nip: (body.nip ?? db.profile.nip).trim(),
      nuptk: (body.nuptk ?? db.profile.nuptk).trim(),
      certificationNumber: (
        body.certificationNumber ?? db.profile.certificationNumber
      ).trim(),
      email: (body.email ?? db.profile.email).trim(),
      location: (body.location ?? db.profile.location).trim(),
      bio: (body.bio ?? db.profile.bio).trim(),
      quote: (body.quote ?? db.profile.quote).trim(),
      photoUrl: nextPhotoUrl,
      updatedAt: new Date().toISOString(),
    };

    let nextState: DatabaseState = { ...db, profile: updatedProfile };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(nextState.syncInfo.appsScriptUrl, nextState);
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    lastRemotePullAt = Date.now();
    res.json({ profile: updatedProfile, syncInfo: nextState.syncInfo, appsScriptSync });
  });

  app.post('/api/admin/records', requireAdmin, async (req: Request, res: Response) => {
    const body = req.body as Partial<AdminRecord> & {
      categoryId: CategoryId;
      fileUpload?: { fileName: string; base64Data: string };
    };

    const validation = validateDocumentInput(body.categoryId, body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(' ') });
      return;
    }

    let uploadedMeta: { fileName?: string; fileUrl?: string; fileSize?: string } = {};
    if (body.fileUpload?.base64Data && body.fileUpload?.fileName) {
      uploadedMeta = saveBase64Upload(
        body.fileUpload.fileName,
        body.fileUpload.base64Data
      );
    }

    const db = readDb();
    const newRecord = normalizeRecordForCategory(body.categoryId, {
      ...body,
      ...uploadedMeta,
    });

    const nextRecords = [newRecord, ...db.records];
    let nextState: DatabaseState = { ...db, records: nextRecords };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(
        nextState.syncInfo.appsScriptUrl,
        nextState,
        body.categoryId
      );
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    res.status(201).json({
      record: newRecord,
      records: nextRecords,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.put('/api/admin/records/:id', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDb();
    const existing = db.records.find((r) => r.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<AdminRecord> & {
      fileUpload?: { fileName: string; base64Data: string };
    };
    const merged = { ...existing, ...body, id: existing.id, categoryId: existing.categoryId };
    const validation = validateDocumentInput(existing.categoryId, merged);
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(' ') });
      return;
    }

    let uploadedMeta: { fileName?: string; fileUrl?: string; fileSize?: string } = {};
    if (body.fileUpload?.base64Data && body.fileUpload?.fileName) {
      uploadedMeta = saveBase64Upload(
        body.fileUpload.fileName,
        body.fileUpload.base64Data
      );
    }

    const updatedRecord = normalizeRecordForCategory(existing.categoryId, {
      ...merged,
      ...uploadedMeta,
      createdAt: existing.createdAt,
    });

    const nextRecords = db.records.map((r) => (r.id === id ? updatedRecord : r));
    let nextState: DatabaseState = { ...db, records: nextRecords };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(
        nextState.syncInfo.appsScriptUrl,
        nextState,
        existing.categoryId
      );
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    res.json({
      record: updatedRecord,
      records: nextRecords,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.delete('/api/admin/records/:id', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDb();
    const existing = db.records.find((r) => r.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      return;
    }
    const nextRecords = db.records.filter((r) => r.id !== id);
    let nextState: DatabaseState = { ...db, records: nextRecords };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(
        nextState.syncInfo.appsScriptUrl,
        nextState,
        existing.categoryId
      );
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    res.json({
      deletedId: id,
      records: nextRecords,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.post('/api/admin/import/:categoryId', requireAdmin, async (req: Request, res: Response) => {
    const categoryId = req.params.categoryId as CategoryId;
    if (!CATEGORY_MAP[categoryId]) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const { csvText } = req.body as { csvText?: string };
    if (!csvText || !csvText.trim()) {
      res.status(400).json({ error: 'Isi berkas CSV tidak boleh kosong.' });
      return;
    }

    const parsed = parseCsvToRecords(categoryId, csvText);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'Tidak ada baris data valid yang dapat diimpor dari CSV.' });
      return;
    }

    const db = readDb();
    const nextRecords = [...parsed, ...db.records];
    let nextState: DatabaseState = { ...db, records: nextRecords };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(
        nextState.syncInfo.appsScriptUrl,
        nextState,
        categoryId
      );
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    res.json({
      importedCount: parsed.length,
      records: nextRecords,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  // Game Center CRUD (Protected Admin Routes)
  app.post('/api/admin/games', requireAdmin, async (req: Request, res: Response) => {
    const body = req.body as Partial<GameItem> & {
      screenshotUpload?: { fileName: string; base64Data: string };
    };

    const hasFile = Boolean(body.screenshotUpload?.base64Data && body.screenshotUpload?.fileName);
    const validation = validateGameInput({
      title: body.title,
      gameUrl: body.gameUrl,
      screenshotUrl: body.screenshotUrl,
      hasScreenshotFile: hasFile,
    });
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(' ') });
      return;
    }

    let finalScreenshotUrl = (body.screenshotUrl || '').trim();
    if (body.screenshotUpload?.base64Data && body.screenshotUpload?.fileName) {
      if (
        body.screenshotUpload.base64Data.startsWith('data:image/') &&
        body.screenshotUpload.base64Data.length <= 45000
      ) {
        finalScreenshotUrl = body.screenshotUpload.base64Data;
      } else {
        const saved = saveBase64Upload(
          body.screenshotUpload.fileName,
          body.screenshotUpload.base64Data
        );
        finalScreenshotUrl = saved.fileUrl;
      }
    }

    const db = readDb();
    const newGame = normalizeGameItem({
      title: body.title,
      gameUrl: body.gameUrl,
      screenshotUrl: finalScreenshotUrl,
    });

    const nextGames = [newGame, ...db.games];
    let nextState: DatabaseState = { ...db, games: nextGames };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(nextState.syncInfo.appsScriptUrl, nextState);
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    lastRemotePullAt = Date.now();
    res.status(201).json({
      game: newGame,
      games: nextGames,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.put('/api/admin/games/:id', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDb();
    const existing = db.games.find((g) => g.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Game tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<GameItem> & {
      screenshotUpload?: { fileName: string; base64Data: string };
    };

    const hasFile = Boolean(body.screenshotUpload?.base64Data && body.screenshotUpload?.fileName);
    const candidateScreenshotUrl = body.screenshotUrl ?? existing.screenshotUrl;
    const validation = validateGameInput({
      title: body.title ?? existing.title,
      gameUrl: body.gameUrl ?? existing.gameUrl,
      screenshotUrl: candidateScreenshotUrl,
      hasScreenshotFile: hasFile,
    });
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(' ') });
      return;
    }

    let finalScreenshotUrl = candidateScreenshotUrl.trim();
    if (body.screenshotUpload?.base64Data && body.screenshotUpload?.fileName) {
      if (
        body.screenshotUpload.base64Data.startsWith('data:image/') &&
        body.screenshotUpload.base64Data.length <= 45000
      ) {
        finalScreenshotUrl = body.screenshotUpload.base64Data;
      } else {
        const saved = saveBase64Upload(
          body.screenshotUpload.fileName,
          body.screenshotUpload.base64Data
        );
        finalScreenshotUrl = saved.fileUrl;
      }
    }

    const updatedGame = normalizeGameItem({
      id: existing.id,
      title: body.title ?? existing.title,
      gameUrl: body.gameUrl ?? existing.gameUrl,
      screenshotUrl: finalScreenshotUrl,
      createdAt: existing.createdAt,
    });

    const nextGames = db.games.map((g) => (g.id === id ? updatedGame : g));
    let nextState: DatabaseState = { ...db, games: nextGames };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(nextState.syncInfo.appsScriptUrl, nextState);
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    lastRemotePullAt = Date.now();
    res.json({
      game: updatedGame,
      games: nextGames,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.delete('/api/admin/games/:id', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDb();
    const existing = db.games.find((g) => g.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Game tidak ditemukan.' });
      return;
    }

    const nextGames = db.games.filter((g) => g.id !== id);
    let nextState: DatabaseState = { ...db, games: nextGames };
    let appsScriptSync: { ok: boolean; message: string } | undefined;
    if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
      appsScriptSync = await pushToAppsScript(nextState.syncInfo.appsScriptUrl, nextState);
      if (appsScriptSync.ok) {
        nextState = {
          ...nextState,
          syncInfo: { ...nextState.syncInfo, lastSyncedAt: new Date().toISOString() },
        };
      }
    }

    writeDb(nextState);
    lastRemotePullAt = Date.now();
    res.json({
      deletedId: id,
      games: nextGames,
      syncInfo: nextState.syncInfo,
      appsScriptSync,
    });
  });

  app.put('/api/admin/sync-info', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as Partial<SpreadsheetSyncInfo>;
    if (body.appsScriptUrl !== undefined && body.appsScriptUrl !== null && body.appsScriptUrl.trim() !== '') {
      if (!isValidAppsScriptUrl(body.appsScriptUrl)) {
        res.status(400).json({
          error:
            'URL Apps Script tidak valid. Harus diawali https://script.google.com/ atau https://script.googleusercontent.com/.',
        });
        return;
      }
    }

    const normalizedAppsScriptUrl =
      body.appsScriptUrl === undefined
        ? db.syncInfo.appsScriptUrl
        : body.appsScriptUrl && body.appsScriptUrl.trim()
          ? body.appsScriptUrl.trim()
          : null;

    const syncInfo: SpreadsheetSyncInfo = {
      ...db.syncInfo,
      ...body,
      appsScriptUrl: normalizedAppsScriptUrl,
    };
    writeDb({ ...db, syncInfo });
    res.json({ syncInfo });
  });

  app.post('/api/admin/apps-script/sync', requireAdmin, async (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as { appsScriptUrl?: string | null; categoryId?: CategoryId };
    const targetUrl = (body.appsScriptUrl ?? db.syncInfo.appsScriptUrl ?? '').trim();

    if (!isValidAppsScriptUrl(targetUrl)) {
      res.status(400).json({
        error:
          'Masukkan URL Web App Google Apps Script yang valid (contoh: https://script.google.com/macros/s/.../exec).',
      });
      return;
    }

    const updatedState: DatabaseState = {
      ...db,
      syncInfo: {
        ...db.syncInfo,
        appsScriptUrl: targetUrl,
      },
    };

    const result = await pushToAppsScript(targetUrl, updatedState, body.categoryId);
    if (!result.ok) {
      // Still persist valid URL so admin does not lose what they entered
      writeDb(updatedState);
      res.status(502).json({
        synced: false,
        error: result.message,
        syncInfo: updatedState.syncInfo,
      });
      return;
    }

    const syncedState: DatabaseState = {
      ...updatedState,
      syncInfo: {
        ...updatedState.syncInfo,
        lastSyncedAt: new Date().toISOString(),
      },
    };
    writeDb(syncedState);
    lastRemotePullAt = Date.now();
    res.json({
      synced: true,
      message: result.message,
      syncInfo: syncedState.syncInfo,
    });
  });

  app.post('/api/admin/apps-script/pull', requireAdmin, async (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as { appsScriptUrl?: string | null };
    const targetUrl = (body.appsScriptUrl ?? db.syncInfo.appsScriptUrl ?? '').trim();

    if (!isValidAppsScriptUrl(targetUrl)) {
      res.status(400).json({
        error:
          'Masukkan URL Web App Google Apps Script yang valid terlebih dahulu.',
      });
      return;
    }

    const result = await pullFromAppsScript(targetUrl, db);
    if (!result.ok) {
      res.status(502).json({
        synced: false,
        needsDoGetUpdate: Boolean(result.needsDoGetUpdate),
        error: result.message,
      });
      return;
    }

    res.json({
      synced: true,
      message: result.message,
      profile: result.state.profile,
      records: result.state.records,
      games: result.state.games,
      syncInfo: result.state.syncInfo,
    });
  });

  // Vite dev middleware or production static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Portal Administrasi GPAI berjalan di http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
