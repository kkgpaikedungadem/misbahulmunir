import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
  GameItem,
  JUZ_30_SURAHS,
  LEGACY_CATEGORY_ID_MAP,
  LEGACY_TAB_NAME_MAP,
  RecordStatus,
  TeacherProfile,
  normalizeCategoryId,
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

export function isTahfidzRecord(record: Partial<AdminRecord>): boolean {
  return Boolean(
    record.studentName &&
      record.tajwidScore !== undefined &&
      record.fluencyScore !== undefined
  );
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
  const safeSurahs = Math.max(
    0,
    Math.min(JUZ_30_SURAHS.length, Number(surahsCompleted) || 0)
  );
  const averageScore = Math.round(((safeTajwid + safeFluency) / 2) * 10) / 10;
  const completionPercent = Math.round((safeSurahs / JUZ_30_SURAHS.length) * 100);

  return {
    averageScore,
    predicate: computeTahfidzPredicate(safeTajwid, safeFluency),
    completionPercent,
  };
}

export function validateDocumentInput(
  rawCategoryId: CategoryId | string,
  input: Partial<AdminRecord>
): ValidationResult {
  const errors: string[] = [];
  const trimmedCat = (rawCategoryId || '').trim();
  const isKnown =
    Boolean(CATEGORY_MAP[trimmedCat as CategoryId]) ||
    Boolean(LEGACY_CATEGORY_ID_MAP[trimmedCat]);
  if (!isKnown) {
    return { valid: false, errors: ['Kategori administrasi tidak dikenali.'] };
  }

  const categoryId = normalizeCategoryId(trimmedCat);
  const config = CATEGORY_MAP[categoryId];

  const isLegacyTahfidzInput =
    trimmedCat === 'rapor-tahfidz-juz-30' || isTahfidzRecord(input);

  if (isLegacyTahfidzInput && trimmedCat === 'rapor-tahfidz-juz-30') {
    if (!input.studentName || !input.studentName.trim()) {
      errors.push('Nama Lengkap Siswa wajib diisi.');
    }
    if (!input.studentClass || !input.studentClass.trim()) {
      errors.push('Kelas wajib diisi.');
    }
    if (!input.codeOrRef || !input.codeOrRef.trim()) {
      errors.push('NIS / No. Induk wajib diisi.');
    }
  } else {
    for (const field of config.fields) {
      if (!field.required) continue;
      const raw = input[field.key];
      if (field.type === 'number') {
        if (
          raw === undefined ||
          raw === null ||
          raw === '' ||
          Number.isNaN(Number(raw))
        ) {
          errors.push(`${field.label} wajib diisi dengan angka yang valid.`);
        }
      } else if (typeof raw !== 'string' || raw.trim().length === 0) {
        errors.push(`${field.label} wajib diisi.`);
      }
    }
  }

  if (isLegacyTahfidzInput) {
    const tajwid = Number(input.tajwidScore);
    const fluency = Number(input.fluencyScore);
    const surahs = Number(input.surahsCompleted);
    if (Number.isNaN(tajwid) || tajwid < 0 || tajwid > 100) {
      errors.push('Nilai Tajwid & Makhraj harus antara 0 hingga 100.');
    }
    if (Number.isNaN(fluency) || fluency < 0 || fluency > 100) {
      errors.push('Nilai Kelancaran harus antara 0 hingga 100.');
    }
    if (
      Number.isNaN(surahs) ||
      surahs < 1 ||
      surahs > JUZ_30_SURAHS.length
    ) {
      errors.push(
        `Jumlah Surah Hafal harus antara 1 hingga ${JUZ_30_SURAHS.length}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeRecordForCategory(
  rawCategoryId: CategoryId | string,
  input: Partial<AdminRecord>
): AdminRecord {
  const categoryId = normalizeCategoryId(rawCategoryId);
  const now = new Date().toISOString();
  const isTahfidz =
    rawCategoryId === 'rapor-tahfidz-juz-30' || isTahfidzRecord(input);
  const tajwid = Number(input.tajwidScore ?? 0);
  const fluency = Number(input.fluencyScore ?? 0);
  const surahsCompleted = Number(input.surahsCompleted ?? 0);

  const computedPredicate = isTahfidz
    ? computeTahfidzPredicate(tajwid, fluency)
    : undefined;

  const computedTitle = isTahfidz
    ? (input.title && input.title.trim()) ||
      `Rapor Tahfidz — ${input.studentName || 'Siswa'} (${
        input.studentClass || input.className || '-'
      })`
    : (input.title || '').trim();

  const resolvedClass =
    input.className?.trim() || input.studentClass?.trim() || undefined;
  const resolvedMetric =
    input.metricValue?.trim() ||
    (isTahfidz && computedPredicate
      ? `${surahsCompleted}/${JUZ_30_SURAHS.length} Surah · ${computedPredicate} (T:${tajwid}/K:${fluency})${
          input.surahRange?.trim() ? ` · ${input.surahRange.trim()}` : ''
        }`
      : undefined);

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
    fileName: input.fileName || undefined,
    fileSize: input.fileSize || undefined,
    fileUrl: input.fileUrl || undefined,
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
    className: resolvedClass,
    subjectTopic: input.subjectTopic?.trim(),
    metricValue: resolvedMetric,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function normalizeRecordsList(records: AdminRecord[]): AdminRecord[] {
  return (records || []).map((rec) => {
    const normalizedCategoryId = normalizeCategoryId(rec.categoryId);
    const resolvedClass =
      rec.className || rec.studentClass || undefined;
    const resolvedMetric =
      rec.metricValue ||
      (isTahfidzRecord(rec) && rec.surahsCompleted !== undefined
        ? `${rec.surahsCompleted}/${JUZ_30_SURAHS.length} Surah · ${
            rec.tahfidzPredicate ||
            computeTahfidzPredicate(
              Number(rec.tajwidScore ?? 0),
              Number(rec.fluencyScore ?? 0)
            )
          }`
        : undefined);

    if (
      normalizedCategoryId === rec.categoryId &&
      resolvedClass === rec.className &&
      resolvedMetric === rec.metricValue
    ) {
      return rec;
    }

    return {
      ...rec,
      categoryId: normalizedCategoryId,
      ...(resolvedClass ? { className: resolvedClass } : {}),
      ...(resolvedMetric ? { metricValue: resolvedMetric } : {}),
    };
  });
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

const MAX_SPREADSHEET_CELL_CHARS = 45000;

function safeSpreadsheetLink(record: AdminRecord): string {
  if (
    record.driveViewUrl &&
    record.driveViewUrl.length <= MAX_SPREADSHEET_CELL_CHARS
  ) {
    return record.driveViewUrl;
  }
  if (record.fileUrl && record.fileUrl.length <= MAX_SPREADSHEET_CELL_CHARS) {
    return record.fileUrl;
  }
  return '';
}

export function buildSpreadsheetSheetRows(
  _categoryId: CategoryId,
  records: AdminRecord[]
): string[][] {
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
    r.title || (r.studentName ? `Rapor Tahfidz — ${r.studentName}` : ''),
    r.codeOrRef,
    r.className || r.studentClass || '',
    r.metricValue ||
      (r.tahfidzPredicate
        ? `${r.surahsCompleted ?? 0}/${JUZ_30_SURAHS.length} Surah · ${r.tahfidzPredicate}`
        : ''),
    r.academicYear,
    r.semester,
    r.date,
    r.status,
    r.summary,
    r.fileName || '',
    safeSpreadsheetLink(r),
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
  const canonicalId = normalizeCategoryId(categoryId);
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const records: AdminRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
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
    const isHttp = Boolean(fileLink) && fileLink.startsWith('http');
    records.push(
      normalizeRecordForCategory(canonicalId, {
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
        driveFileId: isHttp
          ? extractGoogleDriveFileId(fileLink) || undefined
          : undefined,
        driveViewUrl: isHttp ? fileLink : undefined,
      })
    );
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
    const catId = normalizeCategoryId(r.categoryId);
    if (counts[catId] !== undefined) {
      counts[catId]++;
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

export function extractGoogleDriveFileId(rawUrl?: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  const openMatch = trimmed.match(
    /drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*id=([a-zA-Z0-9_-]+)/
  );
  if (openMatch?.[1]) return openMatch[1];
  return null;
}

export function buildGoogleDrivePreviewUrl(
  driveViewUrl?: string,
  driveFileId?: string
): string | null {
  const id = (driveFileId || '').trim() || extractGoogleDriveFileId(driveViewUrl);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

export function buildGoogleDriveDownloadUrl(
  driveViewUrl?: string,
  driveFileId?: string
): string | null {
  const id = (driveFileId || '').trim() || extractGoogleDriveFileId(driveViewUrl);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
}

export function normalizeExternalPhotoUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
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
    errors.push(
      'Link game wajib berupa URL valid (diawali http:// atau https://).'
    );
  }
  if (
    !input.hasScreenshotFile &&
    (!input.screenshotUrl || !input.screenshotUrl.trim())
  ) {
    errors.push(
      'Screenshot game wajib diisi (unggah gambar atau masukkan URL screenshot).'
    );
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
  const normalizedRecords = normalizeRecordsList(records);
  const targetCategories = onlyCategoryId
    ? CATEGORIES.filter((c) => c.id === normalizeCategoryId(onlyCategoryId))
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
            g.screenshotUrl && g.screenshotUrl.length <= 45000
              ? g.screenshotUrl
              : '',
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
        normalizedRecords.filter((r) => r.categoryId === cat.id)
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
        photoUrl:
          normalizeExternalPhotoUrl(kv.get('Foto URL') || '') ||
          fallbackProfile.photoUrl,
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
  const seenIds = new Set<string>();
  let hasRemoteSheets = false;

  if (Array.isArray(raw.sheets)) {
    // Prioritize canonical 14 tabs first, then legacy tabs if canonical tab was empty
    const orderedSheets = [...raw.sheets].sort((a, b) => {
      const aCanonical = CATEGORIES.some(
        (c) => c.id === a.categoryId || c.sheetTabName === a.sheetTabName
      );
      const bCanonical = CATEGORIES.some(
        (c) => c.id === b.categoryId || c.sheetTabName === b.sheetTabName
      );
      return Number(bCanonical) - Number(aCanonical);
    });

    const populatedCategories = new Set<CategoryId>();

    for (const sheet of orderedSheets) {
      const directCat = CATEGORIES.find(
        (c) =>
          c.id === sheet.categoryId || c.sheetTabName === sheet.sheetTabName
      );
      const legacyId =
        (sheet.sheetTabName && LEGACY_TAB_NAME_MAP[sheet.sheetTabName]) ||
        (sheet.categoryId && LEGACY_CATEGORY_ID_MAP[sheet.categoryId]) ||
        undefined;
      const matchedCat =
        directCat || (legacyId ? CATEGORY_MAP[legacyId] : undefined);

      if (!matchedCat || !Array.isArray(sheet.rows) || sheet.rows.length < 2) {
        continue;
      }

      const isLegacySheet = !directCat;
      if (isLegacySheet && populatedCategories.has(matchedCat.id)) {
        continue;
      }

      hasRemoteSheets = true;
      const isLegacyTahfidzRows =
        sheet.sheetTabName === '09_Rapor_Tahfidz_Juz30' ||
        sheet.categoryId === 'rapor-tahfidz-juz-30' ||
        (Array.isArray(sheet.rows[0]) &&
          String(sheet.rows[0][2] ?? '').trim() === 'Nama Siswa');

      for (let i = 1; i < sheet.rows.length; i++) {
        const cols = Array.isArray(sheet.rows[i])
          ? sheet.rows[i].map((c) => String(c ?? ''))
          : [];
        if (cols.every((c) => c.trim() === '')) continue;

        let rec: AdminRecord | null = null;
        if (isLegacyTahfidzRows) {
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
          const isHttpLink =
            Boolean(fileRef) &&
            (fileRef.startsWith('http://') || fileRef.startsWith('https://'));
          const isDirectFile =
            Boolean(fileRef) &&
            (fileRef.startsWith('/api/') || fileRef.startsWith('data:'));
          rec = normalizeRecordForCategory(matchedCat.id, {
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
            fileName:
              isHttpLink || isDirectFile ? undefined : fileRef || undefined,
            driveFileId: isHttpLink
              ? extractGoogleDriveFileId(fileRef) || undefined
              : undefined,
            driveViewUrl: isHttpLink ? fileRef : undefined,
            fileUrl: isDirectFile ? fileRef : undefined,
          });
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
          const isHttp = Boolean(fileLink) && fileLink.startsWith('http');
          const tahfidzMetricMatch = (metricValue || '').match(
            /^(\d+)\s*\/\s*\d+\s*Surah(?:\s*·\s*[^·(]+)?(?:\s*\(T:(\d+)\/K:(\d+)\))?(?:\s*·\s*(.+))?$/i
          );
          const isEncodedTahfidz =
            matchedCat.id === 'data-siswa' &&
            (/^Rapor Tahfidz\s*[—-]/i.test(title || '') || Boolean(tahfidzMetricMatch));
          const parsedStudentName = isEncodedTahfidz
            ? (title || '')
                .replace(/^Rapor Tahfidz\s*[—-]\s*/i, '')
                .replace(/\s*\([^)]+\)\s*$/, '')
                .trim()
            : undefined;
          rec = normalizeRecordForCategory(matchedCat.id, {
            id: id || undefined,
            title: title || 'Dokumen Tanpa Judul',
            codeOrRef: codeOrRef || `REF-${i}`,
            className: className || undefined,
            metricValue: metricValue || undefined,
            ...(isEncodedTahfidz && parsedStudentName
              ? {
                  studentName: parsedStudentName,
                  studentClass: className || undefined,
                  surahsCompleted: tahfidzMetricMatch
                    ? Number(tahfidzMetricMatch[1])
                    : undefined,
                  tajwidScore:
                    tahfidzMetricMatch && tahfidzMetricMatch[2]
                      ? Number(tahfidzMetricMatch[2])
                      : undefined,
                  fluencyScore:
                    tahfidzMetricMatch && tahfidzMetricMatch[3]
                      ? Number(tahfidzMetricMatch[3])
                      : undefined,
                  surahRange:
                    tahfidzMetricMatch && tahfidzMetricMatch[4]
                      ? tahfidzMetricMatch[4].trim()
                      : undefined,
                }
              : {}),
            academicYear: academicYear || '2026/2027',
            semester: (semester as AdminRecord['semester']) || 'Ganjil',
            date: date || new Date().toISOString().slice(0, 10),
            status: (status as RecordStatus) || 'Terverifikasi',
            summary: summary || '-',
            fileName: fileName || undefined,
            driveFileId: isHttp
              ? extractGoogleDriveFileId(fileLink) || undefined
              : undefined,
            driveViewUrl: isHttp ? fileLink : undefined,
            fileUrl:
              fileLink &&
              (fileLink.startsWith('/api/') || fileLink.startsWith('data:'))
                ? fileLink
                : undefined,
          });
        }

        if (rec && !seenIds.has(rec.id)) {
          seenIds.add(rec.id);
          parsedRecords.push(rec);
          populatedCategories.add(matchedCat.id);
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

export const APPS_SCRIPT_CODE_TEMPLATE = `var TARGET_DRIVE_FOLDER_ID = '${DEFAULT_GOOGLE_DRIVE_FOLDER_ID}';

var TAB_NAMES = [
  '01_Profil_Sekolah',
  '02_Visi_dan_Misi',
  '03_Curiculum_Vitae',
  '04_Program_Ajar',
  '05_Kegiatan_KBM',
  '06_Asesmen_Pembelajaran',
  '07_Piloting_PAIS_Berkarakter',
  '08_Analisa_Hasil_Asesmen',
  '09_Pengembangan_Diri',
  '10_Data_Siswa',
  '11_Bank_Soal',
  '12_Pembiasaan_Keagamaan',
  '13_Galeri',
  '14_Berkas_TPG'
];

var LEGACY_TAB_NAMES = [
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

    var seen = {};
    var allNames = TAB_NAMES.concat(LEGACY_TAB_NAMES);
    var sheets = [];
    allNames.forEach(function (tabName) {
      if (seen[tabName]) return;
      seen[tabName] = true;
      var sheet = ss.getSheetByName(tabName);
      if (sheet || TAB_NAMES.indexOf(tabName) >= 0) {
        var rows = sheet ? sheet.getDataRange().getDisplayValues() : [];
        sheets.push({ sheetTabName: tabName, rows: rows });
      }
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

    if (payload.action === 'uploadDriveFile' && payload.base64Data && payload.fileName) {
      var uploaded = uploadFileToDrive_(payload);
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          driveFileId: uploaded.driveFileId,
          driveViewUrl: uploaded.driveViewUrl,
          fileName: uploaded.fileName
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

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

// Pilih fungsi "izinkanAksesDrive" di menu atas editor Apps Script lalu klik "Run" SEKALI SAJA.
// Pastikan SEMUA kotak centang izin Google Drive dicentang saat diminta!
function izinkanAksesDrive() {
  var folder = DriveApp.getFolderById(TARGET_DRIVE_FOLDER_ID);
  var testFile = folder.createFile('_uji_izin_upload.txt', 'ok');
  testFile.setTrashed(true);
  Logger.log('Izin TULIS Google Drive aktif untuk folder: ' + folder.getName());
  return folder.getName();
}

function getOrCreateFolder_(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

function uploadFileToDrive_(payload) {
  var folderId = payload.targetFolderId || TARGET_DRIVE_FOLDER_ID;
  var targetFolder = null;
  if (folderId) {
    try {
      targetFolder = DriveApp.getFolderById(folderId);
    } catch (folderErr) {
      var errMsg = String(folderErr || '');
      if (errMsg.indexOf('auth/drive') >= 0 || errMsg.indexOf('izin') >= 0 || errMsg.indexOf('permission') >= 0) {
        throw folderErr;
      }
      targetFolder = null;
    }
  }
  if (!targetFolder) {
    var rootIt = DriveApp.getFoldersByName('Portal Administrasi GPAI');
    var rootFolder = rootIt.hasNext()
      ? rootIt.next()
      : DriveApp.createFolder('Portal Administrasi GPAI');
    targetFolder = payload.categoryName
      ? getOrCreateFolder_(rootFolder, payload.categoryName)
      : rootFolder;
  }

  var raw = String(payload.base64Data || '');
  var cleanBase64 = raw.indexOf(',') >= 0 ? raw.split(',')[1] : raw;
  var bytes = Utilities.base64Decode(cleanBase64);
  var mimeType = payload.mimeType || 'application/octet-stream';
  var blob = Utilities.newBlob(bytes, mimeType, payload.fileName);
  var file = targetFolder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (permErr) {
    // Abaikan jika domain Google Workspace membatasi sharing publik
  }
  var fileId = file.getId();
  return {
    driveFileId: fileId,
    driveViewUrl: 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing',
    fileName: file.getName()
  };
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

export function verifyStaticAdminCredentials(
  username: string,
  password: string
): boolean {
  return username.trim() === 'gpai' && password === 'misbah5758';
}

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildExcelWorkbookXml(records: AdminRecord[]): string {
  const normalized = normalizeRecordsList(records);
  const sheetsXml = CATEGORIES.map((cat) => {
    const catRecords = normalized.filter((r) => r.categoryId === cat.id);
    const rows = buildSpreadsheetSheetRows(cat.id, catRecords);
    const rowsXml = rows
      .map(
        (row, rowIndex) =>
          `<Row>${row
            .map(
              (cell) =>
                `<Cell${
                  rowIndex === 0 ? ' ss:StyleID="Header"' : ''
                }><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`
            )
            .join('')}</Row>`
      )
      .join('');
    return `<Worksheet ss:Name="${escapeXml(
      cat.sheetTabName.slice(0, 31)
    )}"><Table>${rowsXml}</Table></Worksheet>`;
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

export function buildPublicDocumentHtml(
  record: AdminRecord,
  profile: TeacherProfile
): string {
  const config = CATEGORY_MAP[normalizeCategoryId(record.categoryId)];
  const safeTitle = escapeXml(record.studentName || record.title);
  return `<!doctype html>
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
    <div class="kicker">${escapeXml(config.order)}. ${escapeXml(
    config.name
  )} · Arsip Publik Administrasi GPAI</div>
    <h1>${safeTitle}</h1>
    <div class="meta">${escapeXml(profile.schoolName)} · Tahun Pelajaran ${escapeXml(
    record.academicYear
  )} (${escapeXml(record.semester)})</div>
  </div>
  <table>
    <tr><th>Nomor / Kode Referensi</th><td>${escapeXml(record.codeOrRef)}</td></tr>
    <tr><th>Tanggal Dokumen</th><td>${escapeXml(record.date)}</td></tr>
    <tr><th>Status Validasi</th><td>${escapeXml(record.status)}</td></tr>
    ${
      record.className
        ? `<tr><th>Kelas / Sasaran</th><td>${escapeXml(record.className)}</td></tr>`
        : ''
    }
    ${
      record.metricValue
        ? `<tr><th>Capaian / Keterangan</th><td>${escapeXml(
            record.metricValue
          )}</td></tr>`
        : ''
    }
    ${
      record.studentClass
        ? `<tr><th>Kelas Siswa</th><td>${escapeXml(record.studentClass)}</td></tr>`
        : ''
    }
    ${
      record.surahRange
        ? `<tr><th>Rentang Surah Juz 30</th><td>${escapeXml(
            record.surahRange
          )} (${record.surahsCompleted ?? 0}/37 Surah)</td></tr>`
        : ''
    }
    ${
      record.tajwidScore !== undefined
        ? `<tr><th>Nilai Tajwid &amp; Kelancaran</th><td>Tajwid: ${
            record.tajwidScore
          } · Kelancaran: ${record.fluencyScore ?? '-'} · Predikat: ${escapeXml(
            record.tahfidzPredicate || '-'
          )}</td></tr>`
        : ''
    }
    ${
      record.fileName
        ? `<tr><th>Nama Berkas Lampiran</th><td>${escapeXml(
            record.fileName
          )} (${escapeXml(record.fileSize || '-')})</td></tr>`
        : ''
    }
  </table>
  <div class="summary">
    <strong>Ringkasan / Catatan:</strong><br />
    ${escapeXml(record.summary)}
  </div>
  <div class="sign">
    <div>${escapeXml(profile.location)}, ${escapeXml(record.date)}</div>
    <div>Guru Pendidikan Agama Islam,</div>
    <div style="margin-top: 48px; font-weight: 700;">${escapeXml(
      profile.fullName
    )}</div>
    <div>NIP. ${escapeXml(profile.nip)}</div>
  </div>
</body>
</html>`;
}
