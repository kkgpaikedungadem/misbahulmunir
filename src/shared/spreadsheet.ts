import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  GameItem,
  JUZ_30_SURAHS,
  RecordStatus,
  TeacherProfile,
} from './categories';

export interface TahfidzSummary {
  averageScore: number;
  predicate: 'Mumtaz' | 'Jayyid Jiddan' | 'Jayyid' | 'Maqbul';
  completionPercent: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function computeTahfidzPredicate(
  tajwidScore: number,
  fluencyScore: number
): TahfidzSummary['predicate'] {
  const avg = (tajwidScore + fluencyScore) / 2;
  if (avg >= 90) return 'Mumtaz';
  if (avg >= 80) return 'Jayyid Jiddan';
  if (avg >= 70) return 'Jayyid';
  return 'Maqbul';
}

export function calculateTahfidzSummary(
  tajwidScore: number,
  fluencyScore: number,
  surahsCompleted: number
): TahfidzSummary {
  const safeTajwid = Math.max(0, Math.min(100, Number(tajwidScore) || 0));
  const safeFluency = Math.max(0, Math.min(100, Number(fluencyScore) || 0));
  const safeSurahs = Math.max(0, Math.min(JUZ_30_SURAHS.length, Number(surahsCompleted) || 0));
  const averageScore = Math.round(((safeTajwid + safeFluency) / 2) * 10) / 10;
  const completionPercent = Math.round((safeSurahs / JUZ_30_SURAHS.length) * 100);

  return {
    averageScore,
    predicate: computeTahfidzPredicate(safeTajwid, safeFluency),
    completionPercent,
  };
}

export function validateDocumentInput(
  categoryId: CategoryId,
  input: Partial<AdminRecord>
): ValidationResult {
  const errors: string[] = [];
  const config = CATEGORY_MAP[categoryId];
  if (!config) {
    return { valid: false, errors: ['Kategori administrasi tidak dikenali.'] };
  }

  for (const field of config.fields) {
    if (!field.required) continue;
    const raw = input[field.key];
    if (field.type === 'number') {
      if (raw === undefined || raw === null || raw === '' || Number.isNaN(Number(raw))) {
        errors.push(`${field.label} wajib diisi dengan angka yang valid.`);
      }
    } else if (typeof raw !== 'string' || raw.trim().length === 0) {
      errors.push(`${field.label} wajib diisi.`);
    }
  }

  if (categoryId === 'rapor-tahfidz-juz-30') {
    const tajwid = Number(input.tajwidScore);
    const fluency = Number(input.fluencyScore);
    const surahs = Number(input.surahsCompleted);
    if (Number.isNaN(tajwid) || tajwid < 0 || tajwid > 100) {
      errors.push('Nilai Tajwid & Makhraj harus antara 0 hingga 100.');
    }
    if (Number.isNaN(fluency) || fluency < 0 || fluency > 100) {
      errors.push('Nilai Kelancaran harus antara 0 hingga 100.');
    }
    if (Number.isNaN(surahs) || surahs < 1 || surahs > JUZ_30_SURAHS.length) {
      errors.push(`Jumlah Surah Hafal harus antara 1 hingga ${JUZ_30_SURAHS.length}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeRecordForCategory(
  categoryId: CategoryId,
  input: Partial<AdminRecord>
): AdminRecord {
  const now = new Date().toISOString();
  const isTahfidz = categoryId === 'rapor-tahfidz-juz-30';
  const tajwid = Number(input.tajwidScore ?? 0);
  const fluency = Number(input.fluencyScore ?? 0);
  const surahsCompleted = Number(input.surahsCompleted ?? 0);

  const computedPredicate = isTahfidz
    ? computeTahfidzPredicate(tajwid, fluency)
    : undefined;

  const computedTitle = isTahfidz
    ? (input.title && input.title.trim()) ||
      `Rapor Tahfidz — ${input.studentName || 'Siswa'} (${input.studentClass || '-'})`
    : (input.title || '').trim();

  return {
    id: input.id || `${categoryId}-${Date.now()}`,
    categoryId,
    title: computedTitle,
    codeOrRef: (input.codeOrRef || '').trim(),
    academicYear: (input.academicYear || '2026/2027').trim(),
    semester: (input.semester as AdminRecord['semester']) || 'Ganjil',
    date: input.date || now.slice(0, 10),
    status: (input.status as RecordStatus) || 'Terverifikasi',
    summary: (input.summary || '').trim(),
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileUrl: input.fileUrl,
    driveFileId: input.driveFileId,
    driveViewUrl: input.driveViewUrl,
    sheetSyncedAt: input.sheetSyncedAt,
    studentName: input.studentName?.trim(),
    studentClass: input.studentClass?.trim(),
    surahRange: input.surahRange?.trim(),
    surahsCompleted: isTahfidz ? surahsCompleted : input.surahsCompleted,
    tajwidScore: isTahfidz ? tajwid : input.tajwidScore,
    fluencyScore: isTahfidz ? fluency : input.fluencyScore,
    tahfidzPredicate: isTahfidz ? computedPredicate : input.tahfidzPredicate,
    className: input.className?.trim(),
    subjectTopic: input.subjectTopic?.trim(),
    metricValue: input.metricValue?.trim(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function filterRecords(
  records: AdminRecord[],
  query: string,
  statusFilter: string = 'Semua'
): AdminRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((item) => {
    if (statusFilter !== 'Semua' && item.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      item.title,
      item.codeOrRef,
      item.academicYear,
      item.semester,
      item.summary,
      item.fileName,
      item.studentName,
      item.studentClass,
      item.surahRange,
      item.tahfidzPredicate,
      item.className,
      item.metricValue,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function escapeCsvCell(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildSpreadsheetSheetRows(
  categoryId: CategoryId,
  records: AdminRecord[]
): string[][] {
  if (categoryId === 'rapor-tahfidz-juz-30') {
    const headers = [
      'ID',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Rentang Surah Juz 30',
      'Jumlah Surah',
      'Nilai Tajwid',
      'Nilai Kelancaran',
      'Predikat',
      'Tahun Pelajaran',
      'Semester',
      'Tanggal Penilaian',
      'Status',
      'Catatan Pembimbing',
      'Lampiran Berkas',
    ];
    const rows = records.map((r) => [
      r.id,
      r.codeOrRef,
      r.studentName || '',
      r.studentClass || '',
      r.surahRange || '',
      String(r.surahsCompleted ?? ''),
      String(r.tajwidScore ?? ''),
      String(r.fluencyScore ?? ''),
      r.tahfidzPredicate || '',
      r.academicYear,
      r.semester,
      r.date,
      r.status,
      r.summary,
      r.driveViewUrl || r.fileName || '',
    ]);
    return [headers, ...rows];
  }

  const headers = [
    'ID',
    'Judul Dokumen',
    'Nomor / Kode Referensi',
    'Kelas / Sasaran',
    'Capaian / Keterangan Teknis',
    'Tahun Pelajaran',
    'Semester',
    'Tanggal',
    'Status',
    'Ringkasan',
    'Nama Berkas',
    'Tautan Penyimpanan',
  ];
  const rows = records.map((r) => [
    r.id,
    r.title,
    r.codeOrRef,
    r.className || '',
    r.metricValue || '',
    r.academicYear,
    r.semester,
    r.date,
    r.status,
    r.summary,
    r.fileName || '',
    r.driveViewUrl || r.fileUrl || '',
  ]);
  return [headers, ...rows];
}

export function formatRecordsToCsv(
  categoryId: CategoryId,
  records: AdminRecord[]
): string {
  const rows = buildSpreadsheetSheetRows(categoryId, records);
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCsvToRecords(
  categoryId: CategoryId,
  csvText: string
): AdminRecord[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const records: AdminRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (categoryId === 'rapor-tahfidz-juz-30') {
      const [
        id,
        codeOrRef,
        studentName,
        studentClass,
        surahRange,
        surahsCompleted,
        tajwidScore,
        fluencyScore,
        ,
        academicYear,
        semester,
        date,
        status,
        summary,
        fileName,
      ] = cols;
      records.push(
        normalizeRecordForCategory(categoryId, {
          id: id || undefined,
          codeOrRef: codeOrRef || `NIS-${i}`,
          studentName: studentName || 'Siswa',
          studentClass: studentClass || 'Kelas VI',
          surahRange: surahRange || 'An-Nas s.d. Ad-Duha',
          surahsCompleted: Number(surahsCompleted) || 20,
          tajwidScore: Number(tajwidScore) || 85,
          fluencyScore: Number(fluencyScore) || 85,
          academicYear: academicYear || '2026/2027',
          semester: (semester as AdminRecord['semester']) || 'Ganjil',
          date: date || new Date().toISOString().slice(0, 10),
          status: (status as RecordStatus) || 'Terverifikasi',
          summary: summary || 'Diimpor dari spreadsheet.',
          fileName: fileName || undefined,
        })
      );
    } else {
      const [
        id,
        title,
        codeOrRef,
        className,
        metricValue,
        academicYear,
        semester,
        date,
        status,
        summary,
        fileName,
      ] = cols;
      if (!title && !codeOrRef) continue;
      records.push(
        normalizeRecordForCategory(categoryId, {
          id: id || undefined,
          title: title || 'Dokumen Tanpa Judul',
          codeOrRef: codeOrRef || `REF-${i}`,
          className: className || undefined,
          metricValue: metricValue || undefined,
          academicYear: academicYear || '2026/2027',
          semester: (semester as AdminRecord['semester']) || 'Ganjil',
          date: date || new Date().toISOString().slice(0, 10),
          status: (status as RecordStatus) || 'Terverifikasi',
          summary: summary || 'Diimpor dari spreadsheet.',
          fileName: fileName || undefined,
        })
      );
    }
  }
  return records;
}

export function getCategoryCounts(
  records: AdminRecord[]
): Record<CategoryId, number> {
  const counts = {} as Record<CategoryId, number>;
  for (const cat of CATEGORIES) {
    counts[cat.id] = 0;
  }
  for (const r of records) {
    if (counts[r.categoryId] !== undefined) {
      counts[r.categoryId]++;
    }
  }
  return counts;
}

export function isValidAppsScriptUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'script.google.com' ||
      host === 'script.googleusercontent.com'
    );
  } catch {
    return false;
  }
}

export function normalizeExternalPhotoUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1000`;
  }
  const openMatch = trimmed.match(/drive\.google\.com\/(?:open|uc)\?[^#]*id=([a-zA-Z0-9_-]+)/);
  if (openMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w1000`;
  }
  return trimmed;
}

export function isValidHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateGameInput(input: {
  title?: string;
  gameUrl?: string;
  screenshotUrl?: string;
  hasScreenshotFile?: boolean;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) {
    errors.push('Nama game wajib diisi.');
  }
  if (!input.gameUrl || !isValidHttpUrl(input.gameUrl)) {
    errors.push('Link game wajib berupa URL valid (diawali http:// atau https://).');
  }
  if (!input.hasScreenshotFile && (!input.screenshotUrl || !input.screenshotUrl.trim())) {
    errors.push('Screenshot game wajib diisi (unggah gambar atau masukkan URL screenshot).');
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeGameItem(input: Partial<GameItem>): GameItem {
  const now = new Date().toISOString();
  const rawShot = (input.screenshotUrl || '').trim();
  const normalizedShot = rawShot.startsWith('http')
    ? normalizeExternalPhotoUrl(rawShot)
    : rawShot;

  return {
    id: input.id || `game-${Date.now()}`,
    title: (input.title || '').trim(),
    gameUrl: (input.gameUrl || '').trim(),
    screenshotUrl: normalizedShot,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export interface AppsScriptSyncPayload {
  action: 'syncAll' | 'syncCategory';
  syncedAt: string;
  profileSheet: {
    sheetTabName: string;
    rows: string[][];
  };
  gameSheet?: {
    sheetTabName: string;
    rows: string[][];
  };
  sheets: {
    categoryId: CategoryId;
    categoryName: string;
    sheetTabName: string;
    rows: string[][];
  }[];
}

export function buildAppsScriptPayload(
  profile: TeacherProfile,
  records: AdminRecord[],
  onlyCategoryId?: CategoryId,
  games?: GameItem[]
): AppsScriptSyncPayload {
  const targetCategories = onlyCategoryId
    ? CATEGORIES.filter((c) => c.id === onlyCategoryId)
    : CATEGORIES;

  const safePhotoUrl =
    profile.photoUrl && profile.photoUrl.length <= 45000 ? profile.photoUrl : '';

  const gameSheet = Array.isArray(games)
    ? {
        sheetTabName: 'Game_Center',
        rows: [
          ['ID', 'Nama Game', 'Link Game', 'Screenshot URL', 'Diperbarui'],
          ...games.map((g) => [
            g.id,
            g.title,
            g.gameUrl,
            g.screenshotUrl && g.screenshotUrl.length <= 45000 ? g.screenshotUrl : '',
            g.updatedAt,
          ]),
        ],
      }
    : undefined;

  return {
    action: onlyCategoryId ? 'syncCategory' : 'syncAll',
    syncedAt: new Date().toISOString(),
    profileSheet: {
      sheetTabName: 'Profil_Guru',
      rows: [
        ['Atribut', 'Informasi Guru'],
        ['Nama Lengkap', profile.fullName],
        ['Jabatan', profile.titleRole],
        ['Unit Kerja', profile.schoolName],
        ['NIP', profile.nip],
        ['NUPTK', profile.nuptk],
        ['Sertifikasi', profile.certificationNumber],
        ['Email', profile.email],
        ['Lokasi', profile.location],
        ['Diperbarui', profile.updatedAt],
        ['Bio', profile.bio],
        ['Motto', profile.quote],
        ['Foto URL', safePhotoUrl],
      ],
    },
    ...(gameSheet ? { gameSheet } : {}),
    sheets: targetCategories.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      sheetTabName: cat.sheetTabName,
      rows: buildSpreadsheetSheetRows(
        cat.id,
        records.filter((r) => r.categoryId === cat.id)
      ),
    })),
  };
}

export interface AppsScriptPullRaw {
  ok?: boolean;
  error?: string;
  profileSheet?: {
    sheetTabName?: string;
    rows?: unknown[][];
  };
  gameSheet?: {
    sheetTabName?: string;
    rows?: unknown[][];
  };
  sheets?: {
    categoryId?: string;
    sheetTabName?: string;
    rows?: unknown[][];
  }[];
}

export function parseAppsScriptResponse(
  raw: AppsScriptPullRaw,
  fallbackProfile: TeacherProfile
): {
  profile: TeacherProfile;
  records: AdminRecord[];
  games: GameItem[];
  hasRemoteData: boolean;
} {
  let profile = { ...fallbackProfile };
  let hasRemoteProfile = false;

  const profileRows = raw.profileSheet?.rows;
  if (Array.isArray(profileRows) && profileRows.length > 1) {
    const kv = new Map<string, string>();
    for (let i = 1; i < profileRows.length; i++) {
      const row = profileRows[i];
      if (!Array.isArray(row) || row.length < 2) continue;
      const key = String(row[0] ?? '').trim();
      const val = String(row[1] ?? '').trim();
      if (key) kv.set(key, val);
    }
    if (kv.size > 0) {
      hasRemoteProfile = true;
      profile = {
        ...fallbackProfile,
        fullName: kv.get('Nama Lengkap') || fallbackProfile.fullName,
        titleRole: kv.get('Jabatan') || fallbackProfile.titleRole,
        schoolName: kv.get('Unit Kerja') || fallbackProfile.schoolName,
        nip: kv.get('NIP') || fallbackProfile.nip,
        nuptk: kv.get('NUPTK') || fallbackProfile.nuptk,
        certificationNumber:
          kv.get('Sertifikasi') || fallbackProfile.certificationNumber,
        email: kv.get('Email') || fallbackProfile.email,
        location: kv.get('Lokasi') || fallbackProfile.location,
        updatedAt: kv.get('Diperbarui') || fallbackProfile.updatedAt,
        bio: kv.get('Bio') || fallbackProfile.bio,
        quote: kv.get('Motto') || fallbackProfile.quote,
        photoUrl: kv.get('Foto URL') || fallbackProfile.photoUrl,
      };
    }
  }

  const parsedGames: GameItem[] = [];
  let hasRemoteGames = false;
  const gameRows = raw.gameSheet?.rows;
  if (Array.isArray(gameRows) && gameRows.length > 1) {
    hasRemoteGames = true;
    for (let i = 1; i < gameRows.length; i++) {
      const cols = Array.isArray(gameRows[i])
        ? gameRows[i].map((c) => String(c ?? ''))
        : [];
      const [id, title, gameUrl, screenshotUrl] = cols;
      if (!title || !gameUrl) continue;
      parsedGames.push(
        normalizeGameItem({
          id: id || undefined,
          title,
          gameUrl,
          screenshotUrl: screenshotUrl || '',
        })
      );
    }
  }

  const parsedRecords: AdminRecord[] = [];
  let hasRemoteSheets = false;

  if (Array.isArray(raw.sheets)) {
    for (const sheet of raw.sheets) {
      const matchedCat = CATEGORIES.find(
        (c) =>
          c.id === sheet.categoryId || c.sheetTabName === sheet.sheetTabName
      );
      if (!matchedCat || !Array.isArray(sheet.rows) || sheet.rows.length < 2) {
        continue;
      }
      hasRemoteSheets = true;
      for (let i = 1; i < sheet.rows.length; i++) {
        const cols = Array.isArray(sheet.rows[i])
          ? sheet.rows[i].map((c) => String(c ?? ''))
          : [];
        if (cols.every((c) => c.trim() === '')) continue;

        if (matchedCat.id === 'rapor-tahfidz-juz-30') {
          const [
            id,
            codeOrRef,
            studentName,
            studentClass,
            surahRange,
            surahsCompleted,
            tajwidScore,
            fluencyScore,
            ,
            academicYear,
            semester,
            date,
            status,
            summary,
            fileRef,
          ] = cols;
          if (!studentName && !codeOrRef) continue;
          const isLink =
            fileRef &&
            (fileRef.startsWith('http://') ||
              fileRef.startsWith('https://') ||
              fileRef.startsWith('/api/'));
          parsedRecords.push(
            normalizeRecordForCategory(matchedCat.id, {
              id: id || undefined,
              codeOrRef: codeOrRef || `NIS-${i}`,
              studentName: studentName || 'Siswa',
              studentClass: studentClass || 'Kelas VI',
              surahRange: surahRange || 'An-Nas s.d. Ad-Duha',
              surahsCompleted: Number(surahsCompleted) || 20,
              tajwidScore: Number(tajwidScore) || 85,
              fluencyScore: Number(fluencyScore) || 85,
              academicYear: academicYear || '2026/2027',
              semester: (semester as AdminRecord['semester']) || 'Ganjil',
              date: date || new Date().toISOString().slice(0, 10),
              status: (status as RecordStatus) || 'Terverifikasi',
              summary: summary || '-',
              fileName: isLink ? undefined : fileRef || undefined,
              driveViewUrl: isLink ? fileRef : undefined,
            })
          );
        } else {
          const [
            id,
            title,
            codeOrRef,
            className,
            metricValue,
            academicYear,
            semester,
            date,
            status,
            summary,
            fileName,
            fileLink,
          ] = cols;
          if (!title && !codeOrRef) continue;
          parsedRecords.push(
            normalizeRecordForCategory(matchedCat.id, {
              id: id || undefined,
              title: title || 'Dokumen Tanpa Judul',
              codeOrRef: codeOrRef || `REF-${i}`,
              className: className || undefined,
              metricValue: metricValue || undefined,
              academicYear: academicYear || '2026/2027',
              semester: (semester as AdminRecord['semester']) || 'Ganjil',
              date: date || new Date().toISOString().slice(0, 10),
              status: (status as RecordStatus) || 'Terverifikasi',
              summary: summary || '-',
              fileName: fileName || undefined,
              driveViewUrl:
                fileLink && fileLink.startsWith('http') ? fileLink : undefined,
              fileUrl:
                fileLink && fileLink.startsWith('/api/') ? fileLink : undefined,
            })
          );
        }
      }
    }
  }

  return {
    profile,
    records: parsedRecords,
    games: parsedGames,
    hasRemoteData: hasRemoteProfile || hasRemoteSheets || hasRemoteGames,
  };
}

export const APPS_SCRIPT_CODE_TEMPLATE = `var TAB_NAMES = [
  '01_Berkas_TPG',
  '02_Program_Ajar',
  '03_KBM',
  '04_Asesmen_Pelajaran',
  '05_Analisis_Asesmen',
  '06_Pengembangan_Diri',
  '07_Pembiasaan_Keagamaan',
  '08_Piloting_Sekolah',
  '09_Rapor_Tahfidz_Juz30'
];

function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var profileSheet = ss.getSheetByName('Profil_Guru');
    var profileRows = profileSheet ? profileSheet.getDataRange().getDisplayValues() : [];

    var gameSheet = ss.getSheetByName('Game_Center');
    var gameRows = gameSheet ? gameSheet.getDataRange().getDisplayValues() : [];

    var sheets = TAB_NAMES.map(function (tabName) {
      var sheet = ss.getSheetByName(tabName);
      var rows = sheet ? sheet.getDataRange().getDisplayValues() : [];
      return { sheetTabName: tabName, rows: rows };
    });

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        profileSheet: { sheetTabName: 'Profil_Guru', rows: profileRows },
        gameSheet: { sheetTabName: 'Game_Center', rows: gameRows },
        sheets: sheets
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.profileSheet && payload.profileSheet.rows) {
      writeTab_(ss, payload.profileSheet.sheetTabName || 'Profil_Guru', payload.profileSheet.rows);
    }

    if (payload.gameSheet && payload.gameSheet.rows) {
      writeTab_(ss, payload.gameSheet.sheetTabName || 'Game_Center', payload.gameSheet.rows);
    }

    if (Array.isArray(payload.sheets)) {
      payload.sheets.forEach(function (sheetData) {
        writeTab_(ss, sheetData.sheetTabName, sheetData.rows);
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function writeTab_(ss, tabName, rows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  sheet.clearContents();
  if (rows && rows.length > 0 && rows[0].length > 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  }
}`;
