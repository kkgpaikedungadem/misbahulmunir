export type CategoryId =
  | 'berkas-tpg'
  | 'program-ajar'
  | 'kbm'
  | 'asesmen-pelajaran'
  | 'analisis-hasil-asesmen'
  | 'pengembangan-diri'
  | 'pembiasaan-keagamaan'
  | 'piloting-sekolah'
  | 'rapor-tahfidz-juz-30';

export type RecordStatus = 'Terverifikasi' | 'Aktif' | 'Proses' | 'Draft';

export interface TeacherProfile {
  fullName: string;
  titleRole: string;
  schoolName: string;
  nip: string;
  nuptk: string;
  certificationNumber: string;
  email: string;
  location: string;
  bio: string;
  quote: string;
  photoUrl: string;
  updatedAt: string;
}

export interface AdminRecord {
  id: string;
  categoryId: CategoryId;
  title: string;
  codeOrRef: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap' | 'Tahunan';
  date: string;
  status: RecordStatus;
  summary: string;
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;
  driveFileId?: string;
  driveViewUrl?: string;
  sheetSyncedAt?: string;
  // Extra fields especially for Rapor Tahfidz Juz 30 & specialized categories
  studentName?: string;
  studentClass?: string;
  surahRange?: string;
  surahsCompleted?: number;
  tajwidScore?: number;
  fluencyScore?: number;
  tahfidzPredicate?: string;
  className?: string;
  subjectTopic?: string;
  metricValue?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetSyncInfo {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  appsScriptUrl: string | null;
  disconnectedByUser?: boolean;
  lastSyncedAt: string | null;
  autoSyncEnabled: boolean;
  connectedEmail: string | null;
}

export interface GameItem {
  id: string;
  title: string;
  gameUrl: string;
  screenshotUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryFieldConfig {
  key: keyof AdminRecord;
  label: string;
  placeholder: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required?: boolean;
  options?: string[];
  colWidth?: string;
}

export interface CategoryConfig {
  id: CategoryId;
  order: string;
  name: string;
  sheetTabName: string;
  shortDesc: string;
  primaryMetricLabel: string;
  fields: CategoryFieldConfig[];
  tableColumns: {
    key: keyof AdminRecord;
    label: string;
    align?: 'left' | 'right';
    mono?: boolean;
  }[];
}

export function getAppBaseUrl(): string {
  try {
    const base = import.meta.env && import.meta.env.BASE_URL;
    if (typeof base === 'string' && base.length > 0) {
      return base.endsWith('/') ? base : `${base}/`;
    }
  } catch {
    // Node / server runtime fallback
  }
  return '/';
}

export function resolveAppAssetUrl(assetPath: string): string {
  const trimmed = (assetPath || '').trim();
  if (!trimmed) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  const base = getAppBaseUrl();
  const assetMatch = trimmed.match(/^(?:\/[^/]+)?(\/src\/assets\/.+)$/);
  if (assetMatch) {
    return `${base}${assetMatch[1].slice(1)}`;
  }
  if (trimmed.startsWith('src/assets/')) {
    return `${base}${trimmed}`;
  }
  return trimmed;
}

export const DEFAULT_PROFILE_PHOTO_URL = resolveAppAssetUrl(
  '/src/assets/images/teacher_profile_portrait_1795330622875.jpg'
);

export const SCHOOL_BANNER_URL = resolveAppAssetUrl(
  '/src/assets/images/school_piloting_banner_1795330623823.jpg'
);

export const TAHFIDZ_COVER_URL = resolveAppAssetUrl(
  '/src/assets/images/tahfidz_quran_cover_1795330623011.jpg'
);

export const JUZ_30_SURAHS: string[] = [
  'An-Naba',
  "An-Nazi'at",
  'Abasa',
  'At-Takwir',
  'Al-Infitar',
  'Al-Mutaffifin',
  'Al-Insyiqaq',
  'Al-Buruj',
  'At-Tariq',
  "Al-A'la",
  'Al-Ghasyiyah',
  'Al-Fajr',
  'Al-Balad',
  'Asy-Syams',
  'Al-Lail',
  'Ad-Duha',
  'Asy-Syarh',
  'At-Tin',
  "Al-'Alaq",
  'Al-Qadr',
  'Al-Bayyinah',
  'Az-Zalzalah',
  "Al-'Adiyat",
  "Al-Qari'ah",
  'At-Takasur',
  "Al-'Asr",
  'Al-Humazah',
  'Al-Fil',
  'Quraisy',
  "Al-Ma'un",
  'Al-Kausar',
  'Al-Kafirun',
  'An-Nasr',
  'Al-Lahab',
  'Al-Ikhlas',
  'Al-Falaq',
  'An-Nas',
];

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'berkas-tpg',
    order: '01',
    name: 'Berkas TPG',
    sheetTabName: '01_Berkas_TPG',
    shortDesc:
      'Arsip resmi persyaratan Tunjangan Profesi Guru: SKTP, Sertifikat Pendidik, NRG, Jadwal Mengajar 24 JP, dan SKP.',
    primaryMetricLabel: 'Nomor SK / NRG',
    fields: [
      { key: 'title', label: 'Nama Berkas TPG', placeholder: 'Contoh: SK Dirjen Pembayaran TPG Semester Ganjil', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor SK / Referensi', placeholder: 'Contoh: SKTP/2026/0891', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Terbit', placeholder: '2026-09-01', type: 'date', required: true },
      { key: 'status', label: 'Status Validasi', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Keterangan Berkas', placeholder: 'Ringkasan kelengkapan dan validasi SIAGA/EMIS...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Nama Berkas' },
      { key: 'codeOrRef', label: 'Nomor SK / Ref', mono: true },
      { key: 'academicYear', label: 'Tahun', mono: true },
      { key: 'semester', label: 'Semester' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'program-ajar',
    order: '02',
    name: 'Program Ajar',
    sheetTabName: '02_Program_Ajar',
    shortDesc:
      'Perangkat perencanaan pembelajaran Kurikulum Merdeka: Prota, Promes, ATP, CP, dan Modul Ajar PAI & Budi Pekerti.',
    primaryMetricLabel: 'Fase / Kelas',
    fields: [
      { key: 'title', label: 'Judul Perangkat Ajar', placeholder: 'Contoh: Modul Ajar PAI Fase B — Akhlak Mulia', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Perangkat', placeholder: 'Contoh: MA-PAI-IV-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas / Fase', placeholder: 'Contoh: Kelas IV / Fase B', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Susun', placeholder: '2026-07-15', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Tujuan & Ruang Lingkup', placeholder: 'Penjelasan capaian pembelajaran dan alokasi JP...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Perangkat Ajar' },
      { key: 'codeOrRef', label: 'Kode', mono: true },
      { key: 'className', label: 'Kelas / Fase' },
      { key: 'semester', label: 'Semester' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'kbm',
    order: '03',
    name: 'KBM',
    sheetTabName: '03_KBM',
    shortDesc:
      'Jurnal pelaksanaan Kegiatan Belajar Mengajar harian, daftar hadir peserta didik, serta catatan refleksi kelas.',
    primaryMetricLabel: 'Kelas / Materi',
    fields: [
      { key: 'title', label: 'Topik / Agenda KBM', placeholder: 'Contoh: Jurnal KBM — Memahami Surah Al-Hujurat Ayat 13', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Pertemuan Ke-', placeholder: 'Contoh: KBM-04', type: 'text', required: true },
      { key: 'className', label: 'Kelas', placeholder: 'Contoh: Kelas V-A', type: 'text', required: true },
      { key: 'metricValue', label: 'Kehadiran Siswa', placeholder: 'Contoh: 28/28 Hadir', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal KBM', placeholder: '2026-10-12', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Catatan Pelaksanaan', placeholder: 'Metode pembelajaran, keaktifan siswa, dan tindak lanjut...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Agenda KBM' },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Kehadiran', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'asesmen-pelajaran',
    order: '04',
    name: 'Asesmen Pelajaran',
    sheetTabName: '04_Asesmen_Pelajaran',
    shortDesc:
      'Instrumen asesmen diagnostik, formatif, dan sumatif lengkap dengan kisi-kisi soal, rubrik, dan pedoman penskoran.',
    primaryMetricLabel: 'Jenis Asesmen',
    fields: [
      { key: 'title', label: 'Judul Instrumen Asesmen', placeholder: 'Contoh: Kisi-kisi & Soal Sumatif Tengah Semester PAI', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Paket Soal', placeholder: 'Contoh: STS-PAI-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas Sasaran', placeholder: 'Contoh: Kelas IV & V', type: 'text', required: true },
      { key: 'metricValue', label: 'Bentuk & Jumlah Soal', placeholder: 'Contoh: 25 PG + 5 Uraian', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Asesmen', placeholder: '2026-10-05', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Cakupan Kompetensi', placeholder: 'Deskripsi tujuan pembelajaran yang diujikan...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Instrumen Asesmen' },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Bentuk Soal', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'analisis-hasil-asesmen',
    order: '05',
    name: 'Analisis Hasil Asesmen',
    sheetTabName: '05_Analisis_Asesmen',
    shortDesc:
      'Rekapitulasi ketuntasan KKTP, analisis butir soal, rata-rata capaian kelas, serta program remedial dan pengayaan.',
    primaryMetricLabel: 'Ketuntasan KKTP',
    fields: [
      { key: 'title', label: 'Judul Laporan Analisis', placeholder: 'Contoh: Analisis Butir Soal & Ketuntasan STS Kelas V', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Analisis', placeholder: 'Contoh: ANL-V-2026', type: 'text', required: true },
      { key: 'className', label: 'Kelas', placeholder: 'Contoh: Kelas V-A (28 Siswa)', type: 'text', required: true },
      { key: 'metricValue', label: 'Rata-rata / Ketuntasan', placeholder: 'Contoh: 86,4 · Tuntas 92%', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Analisis', placeholder: '2026-10-18', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Rekomendasi Remedial / Pengayaan', placeholder: 'Ringkasan butir soal sulit dan tindak lanjut siswa...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Laporan Analisis' },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Capaian', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'pengembangan-diri',
    order: '06',
    name: 'Pengembangan Diri',
    sheetTabName: '06_Pengembangan_Diri',
    shortDesc:
      'Sertifikat diklat, workshop kurikulum, kegiatan KKG PAI, publikasi ilmiah, serta bukti dukung kompetensi guru.',
    primaryMetricLabel: 'Jam Pelajaran (JP)',
    fields: [
      { key: 'title', label: 'Nama Kegiatan / Sertifikat', placeholder: 'Contoh: Workshop Pembelajaran Mendalam KKG PAI', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor Sertifikat', placeholder: 'Contoh: SERT-KKG/2026/114', type: 'text', required: true },
      { key: 'metricValue', label: 'Durasi (JP)', placeholder: 'Contoh: 32 JP', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Pelaksanaan', placeholder: '2026-08-22', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Penyelenggara & Hasil', placeholder: 'Instansi penyelenggara dan implementasi di kelas...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Kegiatan / Diklat' },
      { key: 'codeOrRef', label: 'No. Sertifikat', mono: true },
      { key: 'metricValue', label: 'Bobot', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'pembiasaan-keagamaan',
    order: '07',
    name: 'Pembiasaan Keagamaan',
    sheetTabName: '07_Pembiasaan_Keagamaan',
    shortDesc:
      'Program pembinaan karakter religius: Shalat Dhuha & Dhuhur berjamaah, BTQ pagi, PHBI, infaq Jumat, dan pesantren kilat.',
    primaryMetricLabel: 'Frekuensi',
    fields: [
      { key: 'title', label: 'Nama Program Pembiasaan', placeholder: 'Contoh: Shalat Dhuha Berjamaah & Murajaah Pagi', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Program', placeholder: 'Contoh: PK-DHUHA-01', type: 'text', required: true },
      { key: 'metricValue', label: 'Jadwal / Partisipasi', placeholder: 'Contoh: Harian · 98% Siswa', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Laporan', placeholder: '2026-11-01', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Deskripsi Pelaksanaan', placeholder: 'Mekanisme piket guru, pembimbing, dan capaian karakter...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Program Pembiasaan' },
      { key: 'codeOrRef', label: 'Kode', mono: true },
      { key: 'metricValue', label: 'Jadwal & Partisipasi' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'piloting-sekolah',
    order: '08',
    name: 'Piloting Sekolah',
    sheetTabName: '08_Piloting_Sekolah',
    shortDesc:
      'Dokumentasi program unggulan piloting sekolah, integrasi proyek penguatan profil pelajar, dan inovasi pembelajaran PAI digital.',
    primaryMetricLabel: 'Tahap Piloting',
    fields: [
      { key: 'title', label: 'Nama Program Piloting', placeholder: 'Contoh: Piloting Ekosistem Sekolah Ramah Religi', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor SK Tim / Kode', placeholder: 'Contoh: PLT-2026-01', type: 'text', required: true },
      { key: 'metricValue', label: 'Tahap & Capaian', placeholder: 'Contoh: Tahap Implementasi · 85%', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Evaluasi', placeholder: '2026-11-10', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Indikator Keberhasilan', placeholder: 'Dampak program piloting terhadap budaya belajar sekolah...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Program Piloting' },
      { key: 'codeOrRef', label: 'Kode', mono: true },
      { key: 'metricValue', label: 'Progres', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'rapor-tahfidz-juz-30',
    order: '09',
    name: 'Rapor Tahfidz Juz 30',
    sheetTabName: '09_Rapor_Tahfidz_Juz30',
    shortDesc:
      'Buku rapor capaian hafalan Al-Qur’an Juz 30 (An-Naba s.d. An-Nas) lengkap dengan nilai tajwid, kelancaran, dan predikat.',
    primaryMetricLabel: 'Predikat Hafalan',
    fields: [
      { key: 'studentName', label: 'Nama Lengkap Siswa', placeholder: 'Contoh: Ahmad Zaki Al-Fatih', type: 'text', required: true },
      { key: 'studentClass', label: 'Kelas', placeholder: 'Contoh: Kelas VI-A', type: 'text', required: true },
      { key: 'codeOrRef', label: 'NIS / No. Induk', placeholder: 'Contoh: 20260601', type: 'text', required: true },
      { key: 'surahRange', label: 'Rentang Surah Hafalan', placeholder: 'Contoh: An-Nas s.d. Al-Ghasyiyah', type: 'text', required: true },
      { key: 'surahsCompleted', label: 'Jumlah Surah Hafal (maks 37)', placeholder: '28', type: 'number', required: true },
      { key: 'tajwidScore', label: 'Nilai Tajwid & Makhraj (0-100)', placeholder: '92', type: 'number', required: true },
      { key: 'fluencyScore', label: 'Nilai Kelancaran (0-100)', placeholder: '90', type: 'number', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: ['Ganjil', 'Genap', 'Tahunan'], required: true },
      { key: 'date', label: 'Tanggal Penilaian', placeholder: '2026-11-18', type: 'date', required: true },
      { key: 'status', label: 'Status Rapor', placeholder: 'Terverifikasi', type: 'select', options: ['Terverifikasi', 'Aktif', 'Proses', 'Draft'], required: true },
      { key: 'summary', label: 'Catatan Pembimbing Tahfidz', placeholder: 'Evaluasi makharijul huruf, mad, ghunnah, dan target selanjutnya...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'studentName', label: 'Nama Siswa' },
      { key: 'studentClass', label: 'Kelas' },
      { key: 'surahRange', label: 'Capaian Surah' },
      { key: 'surahsCompleted', label: 'Surah', align: 'right', mono: true },
      { key: 'tajwidScore', label: 'Tajwid', align: 'right', mono: true },
      { key: 'fluencyScore', label: 'Lancar', align: 'right', mono: true },
      { key: 'tahfidzPredicate', label: 'Predikat' },
    ],
  },
];

export const CATEGORY_MAP: Record<CategoryId, CategoryConfig> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  },
  {} as Record<CategoryId, CategoryConfig>
);
