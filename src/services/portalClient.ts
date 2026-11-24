import {
  DEFAULT_APPS_SCRIPT_URL,
  DEFAULT_GAMES,
  DEFAULT_PROFILE,
  DEFAULT_SYNC_INFO,
  SEED_RECORDS,
} from '../data/seedData';
import { compressImageDataUrlToLimit } from '../utils/imageCompression';
import {
  AdminRecord,
  CATEGORY_MAP,
  CategoryId,
  GameItem,
  SpreadsheetSyncInfo,
  TeacherProfile,
  resolveAppAssetUrl,
} from '../shared/categories';
import {
  AppsScriptPullRaw,
  buildAppsScriptPayload,
  buildExcelWorkbookXml,
  buildGoogleDriveDownloadUrl,
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
  verifyStaticAdminCredentials,
} from '../shared/spreadsheet';

export interface PortalState {
  profile: TeacherProfile;
  records: AdminRecord[];
  games: GameItem[];
  syncInfo: SpreadsheetSyncInfo;
}

const STATIC_DB_KEY = 'gpai_static_portal_db_v1';
const STATIC_SESSION_KEY = 'gpai_static_admin_session_v1';
const ENV_VITE_APPS_SCRIPT_URL = (
  (import.meta.env && import.meta.env.VITE_APPS_SCRIPT_URL) ||
  ''
).trim();

let detectedBackendMode: 'unknown' | 'api' | 'static' =
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.github.io')
    ? 'static'
    : 'unknown';

export function formatByteSize(bytes: number): string {
  const sizeKb = bytes / 1024;
  return sizeKb >= 1024
    ? `${(sizeKb / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(sizeKb))} KB`;
}

function formatBase64Size(base64Data: string): string {
  const clean = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;
  const approxBytes = Math.round((clean.length * 3) / 4);
  return formatByteSize(approxBytes);
}

function sanitizeStaticAssetUrl(url: string, fallback: string): string {
  const resolved = resolveAppAssetUrl(url);
  if (
    detectedBackendMode === 'static' &&
    resolved.startsWith('/api/uploads/')
  ) {
    return resolveAppAssetUrl(fallback);
  }
  return resolved;
}

function normalizeStateAssets(state: PortalState): PortalState {
  return {
    ...state,
    profile: {
      ...state.profile,
      photoUrl: sanitizeStaticAssetUrl(
        state.profile.photoUrl,
        DEFAULT_PROFILE.photoUrl
      ),
    },
    games: (state.games || []).map((g) => ({
      ...g,
      screenshotUrl: sanitizeStaticAssetUrl(
        g.screenshotUrl,
        DEFAULT_GAMES[0]?.screenshotUrl || ''
      ),
    })),
  };
}

function readStaticDb(): PortalState {
  const fallbackScriptUrl = isValidAppsScriptUrl(ENV_VITE_APPS_SCRIPT_URL)
    ? ENV_VITE_APPS_SCRIPT_URL
    : DEFAULT_APPS_SCRIPT_URL;

  try {
    const raw = window.localStorage.getItem(STATIC_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PortalState>;
      const disconnectedByUser = Boolean(parsed.syncInfo?.disconnectedByUser);
      return normalizeStateAssets({
        profile: parsed.profile || DEFAULT_PROFILE,
        records: Array.isArray(parsed.records) ? parsed.records : SEED_RECORDS,
        games: Array.isArray(parsed.games) ? parsed.games : DEFAULT_GAMES,
        syncInfo: {
          ...DEFAULT_SYNC_INFO,
          ...(parsed.syncInfo || {}),
          appsScriptUrl: disconnectedByUser
            ? parsed.syncInfo?.appsScriptUrl || null
            : parsed.syncInfo?.appsScriptUrl || fallbackScriptUrl,
        },
      });
    }
  } catch {
    // Fallback to seed state if localStorage unavailable or corrupted
  }

  return normalizeStateAssets({
    profile: DEFAULT_PROFILE,
    records: SEED_RECORDS,
    games: DEFAULT_GAMES,
    syncInfo: {
      ...DEFAULT_SYNC_INFO,
      appsScriptUrl: fallbackScriptUrl,
    },
  });
}

const MAX_LOCAL_DATA_URL_CHARS = 350000;
const MAX_SHEET_DATA_URL_CHARS = 45000;

function stripOversizedFileUrls(records: AdminRecord[]): AdminRecord[] {
  return records.map((rec) => {
    if (
      rec.fileUrl &&
      rec.fileUrl.startsWith('data:') &&
      rec.fileUrl.length > MAX_SHEET_DATA_URL_CHARS
    ) {
      const { fileUrl: _omitted, ...rest } = rec;
      return rest;
    }
    return rec;
  });
}

function writeStaticDb(state: PortalState): void {
  try {
    window.localStorage.setItem(STATIC_DB_KEY, JSON.stringify(state));
  } catch {
    try {
      const compactedState: PortalState = {
        ...state,
        records: stripOversizedFileUrls(state.records),
      };
      window.localStorage.setItem(STATIC_DB_KEY, JSON.stringify(compactedState));
    } catch {
      // Ignore unrecoverable storage quota errors without crashing UI
    }
  }
}

async function tryApiFetch(
  url: string,
  init?: RequestInit
): Promise<{
  available: boolean;
  response?: Response;
  json?: unknown;
}> {
  if (detectedBackendMode === 'static') {
    return { available: false };
  }
  try {
    const res = await fetch(url, init);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // Static hosts (e.g., GitHub Pages) return HTML 404/405 for /api/* routes
    if (
      res.status === 404 ||
      res.status === 405 ||
      !contentType.includes('application/json')
    ) {
      detectedBackendMode = 'static';
      return { available: false };
    }
    const json = (await res.json()) as unknown;
    detectedBackendMode = 'api';
    return { available: true, response: res, json };
  } catch {
    detectedBackendMode = 'static';
    return { available: false };
  }
}

async function pushAppsScriptFromBrowser(
  url: string,
  state: PortalState,
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
    // text/plain avoids CORS preflight OPTIONS while Apps Script parses JSON body identically
    const res = await fetch(url.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const rawText = await res.text();
    if (
      rawText.trim().startsWith('<!DOCTYPE') ||
      rawText.includes('accounts.google.com')
    ) {
      return {
        ok: false,
        message:
          'Google Apps Script meminta login Google. Pastikan Deployment Web App diatur ke "Anyone / Siapa saja".',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `Apps Script merespons status HTTP ${res.status}.`,
      };
    }
    try {
      const parsed = JSON.parse(rawText) as { ok?: boolean; error?: string };
      if (parsed.ok === false) {
        return {
          ok: false,
          message:
            parsed.error || 'Skrip Apps Script mengembalikan status gagal.',
        };
      }
    } catch {
      // Plain text 200 OK is valid
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

async function pullAppsScriptFromBrowser(
  url: string,
  currentState: PortalState
): Promise<{
  ok: boolean;
  state: PortalState;
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
    const res = await fetch(
      `${url.trim()}${separator}action=getAll&_t=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
      }
    );
    const rawText = await res.text();
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
          ? 'Apps Script belum memiliki fungsi doGet(e). Salin kode terbaru Code.gs lalu Deploy New Version.'
          : 'Apps Script meminta otorisasi login. Pastikan Deployment Web App diatur ke "Anyone / Siapa saja".',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        state: currentState,
        message: `Apps Script GET merespons status HTTP ${res.status}.`,
      };
    }
    const json = JSON.parse(rawText) as AppsScriptPullRaw;
    if (json.ok === false) {
      return {
        ok: false,
        state: currentState,
        message:
          json.error || 'Apps Script mengembalikan error saat membaca data.',
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

    const localFileById = new Map<string, AdminRecord>();
    for (const localRec of currentState.records) {
      if (localRec.fileUrl) {
        localFileById.set(localRec.id, localRec);
      }
    }

    const mergedRemoteRecords = parsed.records.map((remoteRec) => {
      if (remoteRec.fileUrl) return remoteRec;
      const localMatch = localFileById.get(remoteRec.id);
      if (
        localMatch?.fileUrl &&
        (!remoteRec.fileName || localMatch.fileName === remoteRec.fileName)
      ) {
        return {
          ...remoteRec,
          fileUrl: localMatch.fileUrl,
          fileSize: remoteRec.fileSize || localMatch.fileSize,
        };
      }
      return remoteRec;
    });

    const nextState = normalizeStateAssets({
      ...currentState,
      profile: parsed.profile,
      records:
        mergedRemoteRecords.length > 0
          ? mergedRemoteRecords
          : currentState.records,
      games: parsed.games.length > 0 ? parsed.games : currentState.games,
      syncInfo: {
        ...currentState.syncInfo,
        appsScriptUrl: url.trim(),
        lastSyncedAt: new Date().toISOString(),
      },
    });
    writeStaticDb(nextState);
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

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const api = await tryApiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });

  if (api.available && api.response) {
    const data = api.json as { authenticated?: boolean; error?: string };
    if (!api.response.ok || !data.authenticated) {
      return {
        ok: false,
        error: data.error || 'Login gagal. Periksa kembali kredensial Anda.',
      };
    }
    return { ok: true };
  }

  // Static hosting (GitHub Pages) fallback
  if (!verifyStaticAdminCredentials(username, password)) {
    return {
      ok: false,
      error:
        'Username atau password admin salah. Gunakan kredensial resmi admin GPAI.',
    };
  }

  try {
    const session = {
      username: 'gpai',
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    };
    window.localStorage.setItem(STATIC_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Allow session in-memory via App state even if storage disabled
  }
  return { ok: true };
}

export async function getAdminSession(): Promise<{
  authenticated: boolean;
  username: string | null;
}> {
  const api = await tryApiFetch('/api/auth/session', { cache: 'no-store' });
  if (api.available && api.response?.ok) {
    const data = api.json as { authenticated?: boolean; username?: string | null };
    return {
      authenticated: Boolean(data.authenticated),
      username: data.username ?? null,
    };
  }

  try {
    const raw = window.localStorage.getItem(STATIC_SESSION_KEY);
    if (!raw) return { authenticated: false, username: null };
    const parsed = JSON.parse(raw) as { username?: string; expiresAt?: number };
    if (parsed.username === 'gpai' && (parsed.expiresAt || 0) > Date.now()) {
      return { authenticated: true, username: 'gpai' };
    }
    window.localStorage.removeItem(STATIC_SESSION_KEY);
  } catch {
    // Ignore storage read errors
  }
  return { authenticated: false, username: null };
}

export async function logoutAdmin(): Promise<void> {
  try {
    window.localStorage.removeItem(STATIC_SESSION_KEY);
  } catch {
    // Ignore
  }
  await tryApiFetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchPortalState(
  forceRemote = false
): Promise<PortalState> {
  const endpoint = forceRemote ? '/api/portal?refresh=1' : '/api/portal';
  const api = await tryApiFetch(endpoint, { cache: 'no-store' });
  if (api.available && api.response?.ok) {
    const data = api.json as PortalState;
    return normalizeStateAssets({
      profile: data.profile || DEFAULT_PROFILE,
      records: Array.isArray(data.records) ? data.records : SEED_RECORDS,
      games: Array.isArray(data.games) ? data.games : DEFAULT_GAMES,
      syncInfo: data.syncInfo || DEFAULT_SYNC_INFO,
    });
  }

  const localState = readStaticDb();
  if (
    localState.syncInfo.appsScriptUrl &&
    isValidAppsScriptUrl(localState.syncInfo.appsScriptUrl) &&
    localState.syncInfo.autoSyncEnabled
  ) {
    const pulled = await pullAppsScriptFromBrowser(
      localState.syncInfo.appsScriptUrl,
      localState
    );
    if (pulled.ok) {
      return pulled.state;
    }
  }
  return localState;
}

export async function saveTeacherProfile(
  profileForm: TeacherProfile,
  photoUpload?: { fileName: string; base64Data: string }
): Promise<{
  ok: boolean;
  profile?: TeacherProfile;
  syncInfo?: SpreadsheetSyncInfo;
  appsScriptSync?: { ok: boolean; message: string };
  error?: string;
}> {
  const api = await tryApiFetch('/api/admin/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...profileForm,
      ...(photoUpload ? { photoUpload } : {}),
    }),
  });

  if (api.available && api.response) {
    const data = api.json as {
      profile?: TeacherProfile;
      syncInfo?: SpreadsheetSyncInfo;
      appsScriptSync?: { ok: boolean; message: string };
      error?: string;
    };
    if (!api.response.ok || !data.profile) {
      return {
        ok: false,
        error: data.error || 'Gagal memperbarui profil guru.',
      };
    }
    return {
      ok: true,
      profile: data.profile,
      syncInfo: data.syncInfo,
      appsScriptSync: data.appsScriptSync,
    };
  }

  if (!profileForm.fullName || !profileForm.fullName.trim()) {
    return { ok: false, error: 'Nama lengkap guru wajib diisi.' };
  }

  const db = readStaticDb();
  let nextPhotoUrl = photoUpload?.base64Data
    ? photoUpload.base64Data
    : profileForm.photoUrl
      ? normalizeExternalPhotoUrl(profileForm.photoUrl)
      : db.profile.photoUrl;

  if (nextPhotoUrl.startsWith('data:image/') && nextPhotoUrl.length > 42000) {
    nextPhotoUrl = await compressImageDataUrlToLimit(nextPhotoUrl, {
      maxWidth: 420,
      maxHeight: 540,
      maxChars: 38000,
    });
  }

  const updatedProfile: TeacherProfile = {
    ...db.profile,
    fullName: profileForm.fullName.trim(),
    titleRole: profileForm.titleRole.trim(),
    schoolName: profileForm.schoolName.trim(),
    nip: profileForm.nip.trim(),
    nuptk: profileForm.nuptk.trim(),
    certificationNumber: profileForm.certificationNumber.trim(),
    email: profileForm.email.trim(),
    location: profileForm.location.trim(),
    bio: profileForm.bio.trim(),
    quote: profileForm.quote.trim(),
    photoUrl: resolveAppAssetUrl(nextPhotoUrl),
    updatedAt: new Date().toISOString(),
  };

  let nextState: PortalState = { ...db, profile: updatedProfile };
  let appsScriptSync: { ok: boolean; message: string } | undefined;
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    appsScriptSync = await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState
    );
    if (appsScriptSync.ok) {
      nextState = {
        ...nextState,
        syncInfo: {
          ...nextState.syncInfo,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    }
  }
  writeStaticDb(nextState);
  return {
    ok: true,
    profile: updatedProfile,
    syncInfo: nextState.syncInfo,
    appsScriptSync,
  };
}

export async function saveAdminRecord(
  payload: Partial<AdminRecord> & {
    categoryId: CategoryId;
    fileUpload?: { fileName: string; base64Data: string };
  },
  editingId: string | null
): Promise<{
  ok: boolean;
  records?: AdminRecord[];
  syncInfo?: SpreadsheetSyncInfo;
  appsScriptSync?: { ok: boolean; message: string };
  error?: string;
}> {
  const endpoint = editingId
    ? `/api/admin/records/${editingId}`
    : '/api/admin/records';
  const method = editingId ? 'PUT' : 'POST';

  const api = await tryApiFetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (api.available && api.response) {
    const data = api.json as {
      records?: AdminRecord[];
      syncInfo?: SpreadsheetSyncInfo;
      appsScriptSync?: { ok: boolean; message: string };
      error?: string;
    };
    if (!api.response.ok || !data.records) {
      return {
        ok: false,
        error: data.error || 'Gagal menyimpan data ke database.',
      };
    }
    return {
      ok: true,
      records: data.records,
      syncInfo: data.syncInfo,
      appsScriptSync: data.appsScriptSync,
    };
  }

  const db = readStaticDb();
  const existing = editingId
    ? db.records.find((r) => r.id === editingId)
    : undefined;
  const mergedInput = existing
    ? { ...existing, ...payload, id: existing.id, categoryId: existing.categoryId }
    : payload;

  const validation = validateDocumentInput(payload.categoryId, mergedInput);
  if (!validation.valid) {
    return { ok: false, error: validation.errors.join(' ') };
  }

  let uploadedMeta: {
    fileName?: string;
    fileUrl?: string;
    fileSize?: string;
  } = {};

  if (payload.fileUpload?.base64Data && payload.fileUpload?.fileName) {
    let resolvedDataUrl = payload.fileUpload.base64Data;
    const rawSize = formatBase64Size(resolvedDataUrl);
    if (resolvedDataUrl.startsWith('data:image/') && resolvedDataUrl.length > 42000) {
      resolvedDataUrl = await compressImageDataUrlToLimit(resolvedDataUrl, {
        maxWidth: 900,
        maxHeight: 1200,
        maxChars: 38000,
      });
    }
    uploadedMeta = {
      fileName: payload.fileUpload.fileName,
      fileSize: rawSize,
      ...(resolvedDataUrl.length <= MAX_LOCAL_DATA_URL_CHARS
        ? { fileUrl: resolvedDataUrl }
        : { fileUrl: existing?.fileUrl }),
    };
  }

  const savedRecord = normalizeRecordForCategory(payload.categoryId, {
    ...mergedInput,
    ...uploadedMeta,
    ...(existing ? { createdAt: existing.createdAt } : {}),
  });

  const nextRecords = editingId
    ? db.records.map((r) => (r.id === editingId ? savedRecord : r))
    : [savedRecord, ...db.records];

  let nextState: PortalState = { ...db, records: nextRecords };
  let appsScriptSync: { ok: boolean; message: string } | undefined;
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    appsScriptSync = await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState,
      payload.categoryId
    );
    if (appsScriptSync.ok) {
      nextState = {
        ...nextState,
        syncInfo: {
          ...nextState.syncInfo,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    }
  }
  writeStaticDb(nextState);
  return {
    ok: true,
    records: nextRecords,
    syncInfo: nextState.syncInfo,
    appsScriptSync,
  };
}

export async function deleteAdminRecord(id: string): Promise<{
  ok: boolean;
  records?: AdminRecord[];
  syncInfo?: SpreadsheetSyncInfo;
  error?: string;
}> {
  const api = await tryApiFetch(`/api/admin/records/${id}`, {
    method: 'DELETE',
  });
  if (api.available && api.response) {
    const data = api.json as {
      records?: AdminRecord[];
      syncInfo?: SpreadsheetSyncInfo;
      error?: string;
    };
    if (!api.response.ok || !data.records) {
      return { ok: false, error: data.error || 'Gagal menghapus data.' };
    }
    return { ok: true, records: data.records, syncInfo: data.syncInfo };
  }

  const db = readStaticDb();
  const existing = db.records.find((r) => r.id === id);
  if (!existing) {
    return { ok: false, error: 'Dokumen tidak ditemukan.' };
  }

  const nextRecords = db.records.filter((r) => r.id !== id);
  let nextState: PortalState = { ...db, records: nextRecords };
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    const syncRes = await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState,
      existing.categoryId
    );
    if (syncRes.ok) {
      nextState = {
        ...nextState,
        syncInfo: {
          ...nextState.syncInfo,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    }
  }
  writeStaticDb(nextState);
  return { ok: true, records: nextRecords, syncInfo: nextState.syncInfo };
}

export async function importCsvToCategory(
  categoryId: CategoryId,
  csvText: string
): Promise<{
  ok: boolean;
  importedCount?: number;
  records?: AdminRecord[];
  error?: string;
}> {
  const api = await tryApiFetch(`/api/admin/import/${categoryId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvText }),
  });

  if (api.available && api.response) {
    const data = api.json as {
      importedCount?: number;
      records?: AdminRecord[];
      error?: string;
    };
    if (!api.response.ok || !data.records) {
      return { ok: false, error: data.error || 'Gagal mengimpor berkas CSV.' };
    }
    return {
      ok: true,
      importedCount: data.importedCount,
      records: data.records,
    };
  }

  const parsed = parseCsvToRecords(categoryId, csvText);
  if (parsed.length === 0) {
    return {
      ok: false,
      error: 'Tidak ada baris data valid yang dapat diimpor dari CSV.',
    };
  }

  const db = readStaticDb();
  const nextRecords = [...parsed, ...db.records];
  let nextState: PortalState = { ...db, records: nextRecords };
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState,
      categoryId
    );
  }
  writeStaticDb(nextState);
  return { ok: true, importedCount: parsed.length, records: nextRecords };
}

export async function saveGameItem(
  input: {
    title: string;
    gameUrl: string;
    screenshotUrl: string;
    screenshotUpload?: { fileName: string; base64Data: string };
  },
  editingGameId: string | null
): Promise<{
  ok: boolean;
  games?: GameItem[];
  syncInfo?: SpreadsheetSyncInfo;
  appsScriptSync?: { ok: boolean; message: string };
  error?: string;
}> {
  const endpoint = editingGameId
    ? `/api/admin/games/${editingGameId}`
    : '/api/admin/games';
  const method = editingGameId ? 'PUT' : 'POST';

  const api = await tryApiFetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (api.available && api.response) {
    const data = api.json as {
      games?: GameItem[];
      syncInfo?: SpreadsheetSyncInfo;
      appsScriptSync?: { ok: boolean; message: string };
      error?: string;
    };
    if (!api.response.ok || !data.games) {
      return {
        ok: false,
        error: data.error || 'Gagal menyimpan data Game Center.',
      };
    }
    return {
      ok: true,
      games: data.games,
      syncInfo: data.syncInfo,
      appsScriptSync: data.appsScriptSync,
    };
  }

  const hasFile = Boolean(
    input.screenshotUpload?.base64Data && input.screenshotUpload?.fileName
  );
  const validation = validateGameInput({
    title: input.title,
    gameUrl: input.gameUrl,
    screenshotUrl: input.screenshotUrl,
    hasScreenshotFile: hasFile,
  });
  if (!validation.valid) {
    return { ok: false, error: validation.errors.join(' ') };
  }

  const db = readStaticDb();
  const existing = editingGameId
    ? db.games.find((g) => g.id === editingGameId)
    : undefined;
  let finalShot = input.screenshotUpload?.base64Data
    ? input.screenshotUpload.base64Data
    : input.screenshotUrl.trim();
  if (finalShot.startsWith('data:image/') && finalShot.length > 42000) {
    finalShot = await compressImageDataUrlToLimit(finalShot, {
      maxWidth: 560,
      maxHeight: 360,
      maxChars: 38000,
    });
  }

  const savedGame = normalizeGameItem({
    ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
    title: input.title,
    gameUrl: input.gameUrl,
    screenshotUrl: resolveAppAssetUrl(finalShot),
  });

  const nextGames = editingGameId
    ? db.games.map((g) => (g.id === editingGameId ? savedGame : g))
    : [savedGame, ...db.games];

  let nextState: PortalState = { ...db, games: nextGames };
  let appsScriptSync: { ok: boolean; message: string } | undefined;
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    appsScriptSync = await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState
    );
    if (appsScriptSync.ok) {
      nextState = {
        ...nextState,
        syncInfo: {
          ...nextState.syncInfo,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    }
  }
  writeStaticDb(nextState);
  return {
    ok: true,
    games: nextGames,
    syncInfo: nextState.syncInfo,
    appsScriptSync,
  };
}

export async function deleteGameItem(id: string): Promise<{
  ok: boolean;
  games?: GameItem[];
  syncInfo?: SpreadsheetSyncInfo;
  error?: string;
}> {
  const api = await tryApiFetch(`/api/admin/games/${id}`, {
    method: 'DELETE',
  });
  if (api.available && api.response) {
    const data = api.json as {
      games?: GameItem[];
      syncInfo?: SpreadsheetSyncInfo;
      error?: string;
    };
    if (!api.response.ok || !data.games) {
      return { ok: false, error: data.error || 'Gagal menghapus game.' };
    }
    return { ok: true, games: data.games, syncInfo: data.syncInfo };
  }

  const db = readStaticDb();
  const nextGames = db.games.filter((g) => g.id !== id);
  let nextState: PortalState = { ...db, games: nextGames };
  if (nextState.syncInfo.appsScriptUrl && nextState.syncInfo.autoSyncEnabled) {
    const syncRes = await pushAppsScriptFromBrowser(
      nextState.syncInfo.appsScriptUrl,
      nextState
    );
    if (syncRes.ok) {
      nextState = {
        ...nextState,
        syncInfo: {
          ...nextState.syncInfo,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    }
  }
  writeStaticDb(nextState);
  return { ok: true, games: nextGames, syncInfo: nextState.syncInfo };
}

export async function updateSyncInfoState(
  patch: Partial<SpreadsheetSyncInfo>
): Promise<{
  ok: boolean;
  syncInfo?: SpreadsheetSyncInfo;
  error?: string;
}> {
  const api = await tryApiFetch('/api/admin/sync-info', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (api.available && api.response) {
    const data = api.json as {
      syncInfo?: SpreadsheetSyncInfo;
      error?: string;
    };
    if (!api.response.ok || !data.syncInfo) {
      return {
        ok: false,
        error: data.error || 'Gagal menyimpan konfigurasi sinkronisasi.',
      };
    }
    return { ok: true, syncInfo: data.syncInfo };
  }

  if (
    patch.appsScriptUrl !== undefined &&
    patch.appsScriptUrl !== null &&
    patch.appsScriptUrl.trim() !== '' &&
    !isValidAppsScriptUrl(patch.appsScriptUrl)
  ) {
    return {
      ok: false,
      error:
        'URL Apps Script tidak valid. Harus diawali https://script.google.com/ atau https://script.googleusercontent.com/.',
    };
  }

  const db = readStaticDb();
  const normalizedUrl =
    patch.appsScriptUrl === undefined
      ? db.syncInfo.appsScriptUrl
      : patch.appsScriptUrl && patch.appsScriptUrl.trim()
        ? patch.appsScriptUrl.trim()
        : null;

  const syncInfo: SpreadsheetSyncInfo = {
    ...db.syncInfo,
    ...patch,
    appsScriptUrl: normalizedUrl,
    disconnectedByUser:
      patch.disconnectedByUser !== undefined
        ? patch.disconnectedByUser
        : normalizedUrl
          ? false
          : db.syncInfo.disconnectedByUser,
  };
  writeStaticDb({ ...db, syncInfo });
  return { ok: true, syncInfo };
}

export async function syncToAppsScript(
  appsScriptUrl: string,
  onlyCategoryId?: CategoryId
): Promise<{
  ok: boolean;
  message?: string;
  syncInfo?: SpreadsheetSyncInfo;
  error?: string;
}> {
  const api = await tryApiFetch('/api/admin/apps-script/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appsScriptUrl,
      ...(onlyCategoryId ? { categoryId: onlyCategoryId } : {}),
    }),
  });

  if (api.available && api.response) {
    const data = api.json as {
      synced?: boolean;
      message?: string;
      error?: string;
      syncInfo?: SpreadsheetSyncInfo;
    };
    if (!api.response.ok || !data.synced) {
      return {
        ok: false,
        syncInfo: data.syncInfo,
        error:
          data.error ||
          'URL tersimpan, namun gagal menghubungi Google Apps Script Web App.',
      };
    }
    return {
      ok: true,
      message: data.message,
      syncInfo: data.syncInfo,
    };
  }

  const trimmed = appsScriptUrl.trim();
  const db = readStaticDb();
  const updatedState: PortalState = {
    ...db,
    syncInfo: { ...db.syncInfo, appsScriptUrl: trimmed },
  };
  const pushResult = await pushAppsScriptFromBrowser(
    trimmed,
    updatedState,
    onlyCategoryId
  );
  if (!pushResult.ok) {
    writeStaticDb(updatedState);
    return {
      ok: false,
      syncInfo: updatedState.syncInfo,
      error: pushResult.message,
    };
  }
  const syncedState: PortalState = {
    ...updatedState,
    syncInfo: {
      ...updatedState.syncInfo,
      lastSyncedAt: new Date().toISOString(),
    },
  };
  writeStaticDb(syncedState);
  return {
    ok: true,
    message: pushResult.message,
    syncInfo: syncedState.syncInfo,
  };
}

export async function pullFromAppsScriptClient(
  appsScriptUrl: string
): Promise<{
  ok: boolean;
  needsDoGetUpdate?: boolean;
  message?: string;
  profile?: TeacherProfile;
  records?: AdminRecord[];
  games?: GameItem[];
  syncInfo?: SpreadsheetSyncInfo;
  error?: string;
}> {
  const api = await tryApiFetch('/api/admin/apps-script/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appsScriptUrl }),
  });

  if (api.available && api.response) {
    const data = api.json as {
      synced?: boolean;
      needsDoGetUpdate?: boolean;
      message?: string;
      error?: string;
      profile?: TeacherProfile;
      records?: AdminRecord[];
      games?: GameItem[];
      syncInfo?: SpreadsheetSyncInfo;
    };
    if (!api.response.ok || !data.synced) {
      return {
        ok: false,
        needsDoGetUpdate: Boolean(data.needsDoGetUpdate),
        error:
          data.error ||
          'Gagal menarik data dari Google Spreadsheet melalui Apps Script.',
      };
    }
    return {
      ok: true,
      message: data.message,
      profile: data.profile,
      records: data.records,
      games: data.games,
      syncInfo: data.syncInfo,
    };
  }

  const db = readStaticDb();
  const pulled = await pullAppsScriptFromBrowser(appsScriptUrl.trim(), db);
  if (!pulled.ok) {
    return {
      ok: false,
      needsDoGetUpdate: Boolean(pulled.needsDoGetUpdate),
      error: pulled.message,
    };
  }
  return {
    ok: true,
    message: pulled.message,
    profile: pulled.state.profile,
    records: pulled.state.records,
    games: pulled.state.games,
    syncInfo: pulled.state.syncInfo,
  };
}

export async function uploadAttachmentViaAppsScript(
  appsScriptUrl: string,
  categoryName: string,
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<{
  ok: boolean;
  driveFileId?: string;
  driveViewUrl?: string;
  needsCodeUpdate?: boolean;
  error?: string;
}> {
  if (!isValidAppsScriptUrl(appsScriptUrl)) {
    return { ok: false, error: 'URL Apps Script tidak valid.' };
  }

  try {
    const res = await fetch(appsScriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'uploadDriveFile',
        categoryName,
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        base64Data,
      }),
      redirect: 'follow',
    });

    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const parsed = JSON.parse(rawText) as {
      ok?: boolean;
      driveFileId?: string;
      driveViewUrl?: string;
      error?: string;
    };
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error || 'Apps Script gagal mengunggah ke Drive.' };
    }
    if (parsed.driveFileId && parsed.driveViewUrl) {
      return {
        ok: true,
        driveFileId: parsed.driveFileId,
        driveViewUrl: parsed.driveViewUrl,
      };
    }
    return {
      ok: false,
      needsCodeUpdate: true,
      error: 'Code.gs Apps Script perlu diperbarui agar bisa mengunggah berkas ke Google Drive.',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menghubungi Apps Script.',
    };
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function triggerWorkbookDownload(records: AdminRecord[]): void {
  const xml = buildExcelWorkbookXml(records);
  downloadBlob(
    new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    'Database_Administrasi_GPAI_9_Kategori.xls'
  );
}

export function triggerCategoryCsvDownload(
  categoryId: CategoryId,
  records: AdminRecord[]
): void {
  const config = CATEGORY_MAP[categoryId];
  if (!config) return;
  const filtered = records.filter((r) => r.categoryId === categoryId);
  const csv = `\uFEFF${formatRecordsToCsv(categoryId, filtered)}`;
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${config.sheetTabName}.csv`
  );
}

export function triggerDocumentDownload(
  record: AdminRecord,
  profile: TeacherProfile
): void {
  if (record.fileUrl) {
    const a = document.createElement('a');
    a.href = record.fileUrl;
    a.download = record.fileName || 'dokumen';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const driveDownloadUrl = buildGoogleDriveDownloadUrl(
    record.driveViewUrl,
    record.driveFileId
  );
  if (driveDownloadUrl) {
    const a = document.createElement('a');
    a.href = driveDownloadUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = record.fileName || 'dokumen';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const html = buildPublicDocumentHtml(record, profile);
  const safeFile = (record.fileName || record.codeOrRef || record.id).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${safeFile}.html`
  );
}
