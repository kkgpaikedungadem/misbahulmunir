import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  JUZ_30_SURAHS,
  RecordStatus,
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
