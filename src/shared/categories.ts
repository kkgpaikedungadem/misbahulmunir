export type CategoryId =
  | 'profil-sekolah'
  | 'visi-misi'
  | 'curiculum-vitae'
  | 'program-ajar'
  | 'kegiatan-kbm'
  | 'asesmen-pembelajaran'
  | 'piloting-sekolah-pais-berkarakter'
  | 'analisa-hasil-asesmen'
  | 'pengembangan-diri'
  | 'data-siswa'
  | 'bank-soal'
  | 'pembiasaan-keagamaan'
  | 'galeri'
  | 'berkas-tpg';

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
  // Extra fields for student/tahfidz & specialized records
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

export const DEFAULT_GOOGLE_DRIVE_FOLDER_ID =
  '1GbJOrn4ocpzxaa5omWXS74byughU0v7H';

export const DEFAULT_GOOGLE_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1GbJOrn4ocpzxaa5omWXS74byughU0v7H?usp=drive_link';

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

const STATUS_OPTIONS = ['Terverifikasi', 'Aktif', 'Proses', 'Draft'];
const SEMESTER_OPTIONS = ['Ganjil', 'Genap', 'Tahunan'];

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'profil-sekolah',
    order: '01',
    name: 'Profil Sekolah',
    sheetTabName: '01_Profil_Sekolah',
    shortDesc:
      'Identitas satuan pendidikan, NPSN, akreditasi, data sarana ibadah, dan profil kelembagaan sekolah binaan.',
    primaryMetricLabel: 'NPSN / Akreditasi',
    fields: [
      { key: 'title', label: 'Judul Dokumen Profil Sekolah', placeholder: 'Contoh: Profil Resmi Satuan Pendidikan & Data NPSN', type: 'text', required: true },
      { key: 'codeOrRef', label: 'NPSN / Kode Dokumen', placeholder: 'Contoh: NPSN-20540812', type: 'text', required: true },
      { key: 'metricValue', label: 'Akreditasi / Status Sekolah', placeholder: 'Contoh: Terakreditasi A · Negeri', type: 'text' },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Pembaruan', placeholder: '2026-07-10', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Ringkasan Profil Sekolah', placeholder: 'Alamat lengkap, jumlah rombel, kondisi mushalla, dan lingkungan belajar...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Dokumen Profil' },
      { key: 'codeOrRef', label: 'NPSN / Kode', mono: true },
      { key: 'metricValue', label: 'Akreditasi' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'visi-misi',
    order: '02',
    name: 'Visi dan Misi',
    sheetTabName: '02_Visi_dan_Misi',
    shortDesc:
      'Dokumen visi, misi, tujuan satuan pendidikan, serta penjabaran indikator budaya religius dan karakter peserta didik.',
    primaryMetricLabel: 'SK / Tahun Berlaku',
    fields: [
      { key: 'title', label: 'Judul Dokumen Visi & Misi', placeholder: 'Contoh: Visi, Misi & Tujuan Satuan Pendidikan Berkarakter Islami', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor SK / Referensi', placeholder: 'Contoh: VM-SK/2026/01', type: 'text', required: true },
      { key: 'metricValue', label: 'Fokus Program', placeholder: 'Contoh: Beriman, Bertakwa & Berakhlak Mulia', type: 'text' },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Penetapan', placeholder: '2026-07-12', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Uraian Visi, Misi & Indikator', placeholder: 'Ringkasan butir visi, misi sekolah, dan strategi pencapaiannya...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Dokumen Visi & Misi' },
      { key: 'codeOrRef', label: 'No. SK / Ref', mono: true },
      { key: 'academicYear', label: 'Tahun', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'curiculum-vitae',
    order: '03',
    name: 'Curiculum Vitae',
    sheetTabName: '03_Curiculum_Vitae',
    shortDesc:
      'Daftar riwayat hidup guru PAI, riwayat pendidikan formal, pengalaman mengajar, prestasi, dan rekam jejak pengabdian.',
    primaryMetricLabel: 'NIP / Kualifikasi',
    fields: [
      { key: 'title', label: 'Judul Dokumen CV / Riwayat Hidup', placeholder: 'Contoh: Curiculum Vitae Resmi GPAI & Portofolio Kompetensi', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor / NIP / Referensi', placeholder: 'Contoh: CV-GPAI-2026', type: 'text', required: true },
      { key: 'metricValue', label: 'Kualifikasi / Jabatan', placeholder: 'Contoh: S1 PAI · Guru Pertama', type: 'text' },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Pembaruan', placeholder: '2026-07-14', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Ringkasan Riwayat & Prestasi', placeholder: 'Riwayat pendidikan, masa kerja, organisasi KKG PAI, dan penghargaan...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Dokumen CV' },
      { key: 'codeOrRef', label: 'Nomor / Ref', mono: true },
      { key: 'metricValue', label: 'Kualifikasi' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'program-ajar',
    order: '04',
    name: 'Program Ajar',
    sheetTabName: '04_Program_Ajar',
    shortDesc:
      'Perangkat perencanaan pembelajaran Kurikulum Merdeka: Prota, Promes, ATP, CP, dan Modul Ajar PAI & Budi Pekerti.',
    primaryMetricLabel: 'Fase / Kelas',
    fields: [
      { key: 'title', label: 'Judul Perangkat Ajar', placeholder: 'Contoh: Modul Ajar PAI Fase B — Akhlak Mulia', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Perangkat', placeholder: 'Contoh: MA-PAI-IV-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas / Fase', placeholder: 'Contoh: Kelas IV / Fase B', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Susun', placeholder: '2026-07-15', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
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
    id: 'kegiatan-kbm',
    order: '05',
    name: 'Kegiatan KBM',
    sheetTabName: '05_Kegiatan_KBM',
    shortDesc:
      'Jurnal pelaksanaan Kegiatan Belajar Mengajar harian, daftar hadir peserta didik, serta catatan refleksi kelas.',
    primaryMetricLabel: 'Kelas / Kehadiran',
    fields: [
      { key: 'title', label: 'Topik / Agenda KBM', placeholder: 'Contoh: Jurnal KBM — Memahami Surah Al-Hujurat Ayat 13', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Pertemuan Ke-', placeholder: 'Contoh: KBM-04', type: 'text', required: true },
      { key: 'className', label: 'Kelas', placeholder: 'Contoh: Kelas V-A', type: 'text', required: true },
      { key: 'metricValue', label: 'Kehadiran Siswa', placeholder: 'Contoh: 28/28 Hadir', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal KBM', placeholder: '2026-10-12', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: STATUS_OPTIONS, required: true },
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
    id: 'asesmen-pembelajaran',
    order: '06',
    name: 'Asesmen Pembelajaran',
    sheetTabName: '06_Asesmen_Pembelajaran',
    shortDesc:
      'Instrumen asesmen diagnostik, formatif, dan sumatif lengkap dengan kisi-kisi soal, rubrik, dan pedoman penskoran.',
    primaryMetricLabel: 'Bentuk Asesmen',
    fields: [
      { key: 'title', label: 'Judul Instrumen Asesmen', placeholder: 'Contoh: Kisi-kisi & Rubrik Sumatif Tengah Semester PAI', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Instrumen', placeholder: 'Contoh: ASM-PAI-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas Sasaran', placeholder: 'Contoh: Kelas IV & V', type: 'text', required: true },
      { key: 'metricValue', label: 'Bentuk & Jumlah Aspek', placeholder: 'Contoh: Diagnostik & Sumatif', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Asesmen', placeholder: '2026-10-05', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Cakupan Kompetensi', placeholder: 'Deskripsi tujuan pembelajaran yang dinilai...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Instrumen Asesmen' },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Bentuk', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'piloting-sekolah-pais-berkarakter',
    order: '07',
    name: 'Piloting Sekolah PAIS Berkarakter',
    sheetTabName: '07_Piloting_PAIS_Berkarakter',
    shortDesc:
      'Dokumentasi program unggulan Piloting Sekolah PAIS Berkarakter, penguatan profil pelajar berakhlak, dan budaya religius sekolah.',
    primaryMetricLabel: 'Tahap Piloting',
    fields: [
      { key: 'title', label: 'Nama Program Piloting PAIS', placeholder: 'Contoh: Piloting Sekolah PAIS Berkarakter & Ramah Anak', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor SK Tim / Kode', placeholder: 'Contoh: PAIS-PLT-2026-01', type: 'text', required: true },
      { key: 'metricValue', label: 'Tahap & Capaian', placeholder: 'Contoh: Tahap Implementasi · 88%', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Evaluasi', placeholder: '2026-11-10', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Indikator Keberhasilan', placeholder: 'Dampak program piloting PAIS berkarakter terhadap budaya sekolah...', type: 'textarea', required: true },
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
    id: 'analisa-hasil-asesmen',
    order: '08',
    name: 'Analisa Hasil Asesmen',
    sheetTabName: '08_Analisa_Hasil_Asesmen',
    shortDesc:
      'Rekapitulasi ketuntasan KKTP, analisa butir soal, rata-rata capaian kelas, serta program remedial dan pengayaan.',
    primaryMetricLabel: 'Ketuntasan KKTP',
    fields: [
      { key: 'title', label: 'Judul Laporan Analisa', placeholder: 'Contoh: Analisa Butir Soal & Ketuntasan STS Kelas V', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Analisa', placeholder: 'Contoh: ANL-V-2026', type: 'text', required: true },
      { key: 'className', label: 'Kelas', placeholder: 'Contoh: Kelas V-A (28 Siswa)', type: 'text', required: true },
      { key: 'metricValue', label: 'Rata-rata / Ketuntasan', placeholder: 'Contoh: 86,4 · Tuntas 92%', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Analisa', placeholder: '2026-10-18', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Rekomendasi Remedial / Pengayaan', placeholder: 'Ringkasan butir soal sulit dan tindak lanjut siswa...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Laporan Analisa' },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Capaian', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'pengembangan-diri',
    order: '09',
    name: 'Pengembangan Diri',
    sheetTabName: '09_Pengembangan_Diri',
    shortDesc:
      'Sertifikat diklat, workshop kurikulum, kegiatan KKG PAI, publikasi ilmiah, serta bukti dukung kompetensi guru.',
    primaryMetricLabel: 'Jam Pelajaran (JP)',
    fields: [
      { key: 'title', label: 'Nama Kegiatan / Sertifikat', placeholder: 'Contoh: Workshop Pembelajaran Mendalam KKG PAI', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor Sertifikat', placeholder: 'Contoh: SERT-KKG/2026/114', type: 'text', required: true },
      { key: 'metricValue', label: 'Durasi (JP)', placeholder: 'Contoh: 32 JP', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Pelaksanaan', placeholder: '2026-08-22', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
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
    id: 'data-siswa',
    order: '10',
    name: 'Data Siswa',
    sheetTabName: '10_Data_Siswa',
    shortDesc:
      'Rekapitulasi data peserta didik, daftar rombongan belajar, catatan bimbingan keagamaan, dan capaian hafalan siswa.',
    primaryMetricLabel: 'Jumlah / Capaian',
    fields: [
      { key: 'title', label: 'Judul Data / Nama Siswa', placeholder: 'Contoh: Data Peserta Didik Kelas I–VI & Rekap Tahfidz', type: 'text', required: true },
      { key: 'codeOrRef', label: 'NIS / Kode Rombel', placeholder: 'Contoh: DSW-2026-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas / Rombel', placeholder: 'Contoh: Kelas IV–VI', type: 'text', required: true },
      { key: 'metricValue', label: 'Jumlah / Capaian Siswa', placeholder: 'Contoh: 142 Siswa Aktif', type: 'text' },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Pembaruan', placeholder: '2026-11-18', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Keterangan Data Siswa', placeholder: 'Rincian jumlah siswa muslim, kelompok belajar BTQ/tahfidz, atau catatan pembimbingan...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Data / Nama Siswa' },
      { key: 'codeOrRef', label: 'Kode / NIS', mono: true },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Capaian / Jumlah', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'bank-soal',
    order: '11',
    name: 'Bank Soal',
    sheetTabName: '11_Bank_Soal',
    shortDesc:
      'Kumpulan naskah soal ulangan harian, STS, SAS, asesmen sumatif akhir jenjang, beserta kisi-kisi dan kunci jawaban.',
    primaryMetricLabel: 'Jumlah & Tipe Soal',
    fields: [
      { key: 'title', label: 'Judul Paket Bank Soal', placeholder: 'Contoh: Bank Soal Sumatif Akhir Semester PAI Kelas V', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Paket Soal', placeholder: 'Contoh: BS-PAI-V-01', type: 'text', required: true },
      { key: 'className', label: 'Kelas / Fase', placeholder: 'Contoh: Kelas V / Fase C', type: 'text', required: true },
      { key: 'metricValue', label: 'Jumlah & Tipe Soal', placeholder: 'Contoh: 35 PG + 5 Uraian', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Susun', placeholder: '2026-10-25', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Materi & Kisi-kisi', placeholder: 'Bab materi yang diujikan, level kognitif HOTS, dan kelengkapan kunci...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Paket Bank Soal' },
      { key: 'codeOrRef', label: 'Kode', mono: true },
      { key: 'className', label: 'Kelas' },
      { key: 'metricValue', label: 'Jumlah Soal', mono: true },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'pembiasaan-keagamaan',
    order: '12',
    name: 'Pembiasaan Keagamaan',
    sheetTabName: '12_Pembiasaan_Keagamaan',
    shortDesc:
      'Program pembinaan karakter religius: Shalat Dhuha & Dhuhur berjamaah, BTQ pagi, PHBI, infaq Jumat, dan pesantren kilat.',
    primaryMetricLabel: 'Frekuensi',
    fields: [
      { key: 'title', label: 'Nama Program Pembiasaan', placeholder: 'Contoh: Shalat Dhuha Berjamaah & Murajaah Pagi', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Program', placeholder: 'Contoh: PK-DHUHA-01', type: 'text', required: true },
      { key: 'metricValue', label: 'Jadwal / Partisipasi', placeholder: 'Contoh: Harian · 98% Siswa', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Tahunan', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Laporan', placeholder: '2026-11-01', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: STATUS_OPTIONS, required: true },
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
    id: 'galeri',
    order: '13',
    name: 'Galeri',
    sheetTabName: '13_Galeri',
    shortDesc:
      'Dokumentasi foto, poster, dan arsip visual kegiatan keagamaan, lomba PAI, PHBI, serta aktivitas pembelajaran siswa.',
    primaryMetricLabel: 'Jenis Dokumentasi',
    fields: [
      { key: 'title', label: 'Judul Dokumentasi / Album', placeholder: 'Contoh: Dokumentasi Peringatan Maulid Nabi & Lomba MAPSI', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Kode Dokumentasi', placeholder: 'Contoh: GLR-2026-01', type: 'text', required: true },
      { key: 'metricValue', label: 'Jenis / Lokasi Kegiatan', placeholder: 'Contoh: Foto Kegiatan · Halaman Sekolah', type: 'text' },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Kegiatan', placeholder: '2026-11-12', type: 'date', required: true },
      { key: 'status', label: 'Status', placeholder: 'Aktif', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'summary', label: 'Keterangan Dokumentasi', placeholder: 'Deskripsi momen kegiatan, peserta yang terlibat, dan tujuan dokumentasi...', type: 'textarea', required: true },
    ],
    tableColumns: [
      { key: 'title', label: 'Judul Dokumentasi' },
      { key: 'codeOrRef', label: 'Kode', mono: true },
      { key: 'metricValue', label: 'Keterangan Visual' },
      { key: 'date', label: 'Tanggal', mono: true },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'berkas-tpg',
    order: '14',
    name: 'Berkas TPG',
    sheetTabName: '14_Berkas_TPG',
    shortDesc:
      'Arsip resmi persyaratan Tunjangan Profesi Guru: SKTP, Sertifikat Pendidik, NRG, Jadwal Mengajar 24 JP, dan SKP.',
    primaryMetricLabel: 'Nomor SK / NRG',
    fields: [
      { key: 'title', label: 'Nama Berkas TPG', placeholder: 'Contoh: SK Dirjen Pembayaran TPG Semester Ganjil', type: 'text', required: true },
      { key: 'codeOrRef', label: 'Nomor SK / Referensi', placeholder: 'Contoh: SKTP/2026/0891', type: 'text', required: true },
      { key: 'academicYear', label: 'Tahun Pelajaran', placeholder: '2026/2027', type: 'text', required: true },
      { key: 'semester', label: 'Semester', placeholder: 'Ganjil', type: 'select', options: SEMESTER_OPTIONS, required: true },
      { key: 'date', label: 'Tanggal Terbit', placeholder: '2026-09-01', type: 'date', required: true },
      { key: 'status', label: 'Status Validasi', placeholder: 'Terverifikasi', type: 'select', options: STATUS_OPTIONS, required: true },
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
];

export const CATEGORY_MAP: Record<CategoryId, CategoryConfig> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  },
  {} as Record<CategoryId, CategoryConfig>
);

export const LEGACY_CATEGORY_ID_MAP: Record<string, CategoryId> = {
  'berkas-tpg': 'berkas-tpg',
  'program-ajar': 'program-ajar',
  kbm: 'kegiatan-kbm',
  'asesmen-pelajaran': 'asesmen-pembelajaran',
  'analisis-hasil-asesmen': 'analisa-hasil-asesmen',
  'pengembangan-diri': 'pengembangan-diri',
  'pembiasaan-keagamaan': 'pembiasaan-keagamaan',
  'piloting-sekolah': 'piloting-sekolah-pais-berkarakter',
  'rapor-tahfidz-juz-30': 'data-siswa',
};

export const LEGACY_TAB_NAME_MAP: Record<string, CategoryId> = {
  '01_Berkas_TPG': 'berkas-tpg',
  '02_Program_Ajar': 'program-ajar',
  '03_KBM': 'kegiatan-kbm',
  '04_Asesmen_Pelajaran': 'asesmen-pembelajaran',
  '05_Analisis_Asesmen': 'analisa-hasil-asesmen',
  '06_Pengembangan_Diri': 'pengembangan-diri',
  '07_Pembiasaan_Keagamaan': 'pembiasaan-keagamaan',
  '08_Piloting_Sekolah': 'piloting-sekolah-pais-berkarakter',
  '09_Rapor_Tahfidz_Juz30': 'data-siswa',
};

export function normalizeCategoryId(rawCategoryId?: string | null): CategoryId {
  const key = (rawCategoryId || '').trim() as CategoryId;
  if (key && CATEGORY_MAP[key]) {
    return key;
  }
  if (key && LEGACY_CATEGORY_ID_MAP[key]) {
    return LEGACY_CATEGORY_ID_MAP[key];
  }
  return CATEGORIES[0].id;
}
