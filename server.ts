import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_PROFILE, DEFAULT_SYNC_INFO, SEED_RECORDS } from './src/data/seedData';
import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  SpreadsheetSyncInfo,
  TeacherProfile,
} from './src/shared/categories';
import {
  buildSpreadsheetSheetRows,
  formatRecordsToCsv,
  normalizeRecordForCategory,
  parseCsvToRecords,
  validateDocumentInput,
} from './src/shared/spreadsheet';

interface DatabaseState {
  profile: TeacherProfile;
  records: AdminRecord[];
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
      syncInfo: DEFAULT_SYNC_INFO,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

function readDb(): DatabaseState {
  ensureStorage();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseState;
    return {
      profile: parsed.profile || DEFAULT_PROFILE,
      records: Array.isArray(parsed.records) ? parsed.records : SEED_RECORDS,
      syncInfo: parsed.syncInfo || DEFAULT_SYNC_INFO,
    };
  } catch {
    return {
      profile: DEFAULT_PROFILE,
      records: SEED_RECORDS,
      syncInfo: DEFAULT_SYNC_INFO,
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildExcelWorkbookXml(records: AdminRecord[]): string {
  const sheetsXml = CATEGORIES.map((cat) => {
    const catRecords = records.filter((r) => r.categoryId === cat.id);
    const rows = buildSpreadsheetSheetRows(cat.id, catRecords);
    const rowsXml = rows
      .map(
        (row, rowIndex) =>
          `<Row>${row
            .map(
              (cell) =>
                `<Cell${rowIndex === 0 ? ' ss:StyleID="Header"' : ''}><Data ss:Type="String">${escapeXml(
                  cell
                )}</Data></Cell>`
            )
            .join('')}</Row>`
      )
      .join('');
    return `<Worksheet ss:Name="${escapeXml(cat.sheetTabName.slice(0, 31))}"><Table>${rowsXml}</Table></Worksheet>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F6B4E" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${sheetsXml}
</Workbook>`;
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

  // Public portal data
  app.get('/api/portal', (_req: Request, res: Response) => {
    const db = readDb();
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
    const config = CATEGORY_MAP[record.categoryId];
    const safeTitle = escapeXml(record.studentName || record.title);
    const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle} — ${escapeXml(config.name)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 40px auto; max-width: 780px; padding: 0 24px; line-height: 1.6; }
    .header { border-bottom: 2px solid #173828; padding-bottom: 16px; margin-bottom: 24px; }
    .kicker { font-size: 12px; font-weight: 700; color: #0F6B4E; text-transform: uppercase; letter-spacing: 0.05em; }
    h1 { font-size: 24px; margin: 6px 0 4px; }
    .meta { font-size: 13px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { text-align: left; padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 14px; }
    th { width: 32%; background: #f8fafc; color: #334155; }
    .summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px; font-size: 14px; }
    .sign { margin-top: 48px; text-align: right; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="kicker">${escapeXml(config.order)}. ${escapeXml(config.name)} · Arsip Publik Administrasi GPAI</div>
    <h1>${safeTitle}</h1>
    <div class="meta">${escapeXml(db.profile.schoolName)} · Tahun Pelajaran ${escapeXml(record.academicYear)} (${escapeXml(record.semester)})</div>
  </div>
  <table>
    <tr><th>Nomor / Kode Referensi</th><td>${escapeXml(record.codeOrRef)}</td></tr>
    <tr><th>Tanggal Dokumen</th><td>${escapeXml(record.date)}</td></tr>
    <tr><th>Status Validasi</th><td>${escapeXml(record.status)}</td></tr>
    ${record.className ? `<tr><th>Kelas / Sasaran</th><td>${escapeXml(record.className)}</td></tr>` : ''}
    ${record.metricValue ? `<tr><th>Capaian / Keterangan</th><td>${escapeXml(record.metricValue)}</td></tr>` : ''}
    ${record.studentClass ? `<tr><th>Kelas Siswa</th><td>${escapeXml(record.studentClass)}</td></tr>` : ''}
    ${record.surahRange ? `<tr><th>Rentang Surah Juz 30</th><td>${escapeXml(record.surahRange)} (${record.surahsCompleted ?? 0}/37 Surah)</td></tr>` : ''}
    ${record.tajwidScore !== undefined ? `<tr><th>Nilai Tajwid &amp; Kelancaran</th><td>Tajwid: ${record.tajwidScore} · Kelancaran: ${record.fluencyScore ?? '-'} · Predikat: ${escapeXml(record.tahfidzPredicate || '-')}</td></tr>` : ''}
    ${record.fileName ? `<tr><th>Nama Berkas Lampiran</th><td>${escapeXml(record.fileName)} (${escapeXml(record.fileSize || '-')})</td></tr>` : ''}
  </table>
  <div class="summary">
    <strong>Ringkasan / Catatan:</strong><br />
    ${escapeXml(record.summary)}
  </div>
  <div class="sign">
    <div>${escapeXml(db.profile.location)}, ${escapeXml(record.date)}</div>
    <div>Guru Pendidikan Agama Islam,</div>
    <div style="margin-top: 48px; font-weight: 700;">${escapeXml(db.profile.fullName)}</div>
    <div>NIP. ${escapeXml(db.profile.nip)}</div>
  </div>
</body>
</html>`;

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
  app.put('/api/admin/profile', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as Partial<TeacherProfile> & {
      photoUpload?: { fileName: string; base64Data: string };
    };

    if (!body.fullName || !body.fullName.trim()) {
      res.status(400).json({ error: 'Nama lengkap guru wajib diisi.' });
      return;
    }

    let nextPhotoUrl = body.photoUrl || db.profile.photoUrl;
    if (body.photoUpload?.base64Data && body.photoUpload?.fileName) {
      const saved = saveBase64Upload(
        body.photoUpload.fileName,
        body.photoUpload.base64Data
      );
      nextPhotoUrl = saved.fileUrl;
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

    writeDb({ ...db, profile: updatedProfile });
    res.json({ profile: updatedProfile });
  });

  app.post('/api/admin/records', requireAdmin, (req: Request, res: Response) => {
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
    writeDb({ ...db, records: nextRecords });
    res.status(201).json({ record: newRecord, records: nextRecords });
  });

  app.put('/api/admin/records/:id', requireAdmin, (req: Request, res: Response) => {
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
    writeDb({ ...db, records: nextRecords });
    res.json({ record: updatedRecord, records: nextRecords });
  });

  app.delete('/api/admin/records/:id', requireAdmin, (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDb();
    const exists = db.records.some((r) => r.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      return;
    }
    const nextRecords = db.records.filter((r) => r.id !== id);
    writeDb({ ...db, records: nextRecords });
    res.json({ deletedId: id, records: nextRecords });
  });

  app.post('/api/admin/import/:categoryId', requireAdmin, (req: Request, res: Response) => {
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
    writeDb({ ...db, records: nextRecords });
    res.json({ importedCount: parsed.length, records: nextRecords });
  });

  app.put('/api/admin/sync-info', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const body = req.body as Partial<SpreadsheetSyncInfo>;
    const syncInfo: SpreadsheetSyncInfo = {
      ...db.syncInfo,
      ...body,
    };
    writeDb({ ...db, syncInfo });
    res.json({ syncInfo });
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
