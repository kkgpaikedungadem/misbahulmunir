import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  JUZ_30_SURAHS,
  normalizeCategoryId,
  resolveAppAssetUrl,
} from './categories';
import { DEFAULT_PROFILE } from '../data/seedData';
import {
  APPS_SCRIPT_CODE_TEMPLATE,
  buildAppsScriptPayload,
  buildExcelWorkbookXml,
  buildGoogleDriveDownloadUrl,
  buildGoogleDrivePreviewUrl,
  buildPublicDocumentHtml,
  buildSpreadsheetSheetRows,
  calculateTahfidzSummary,
  extractGoogleDriveFileId,
  filterRecords,
  formatRecordsToCsv,
  isTahfidzRecord,
  isValidAppsScriptUrl,
  normalizeExternalPhotoUrl,
  normalizeGameItem,
  normalizeRecordForCategory,
  parseAppsScriptResponse,
  parseCsvToRecords,
  validateDocumentInput,
  validateGameInput,
  verifyStaticAdminCredentials,
} from './spreadsheet';

test('all 14 requested GPAI categories exist in exact order with unique <=31-char sheet tabs', () => {
  assert.equal(CATEGORIES.length, 14);
  const expectedNames = [
    'Profil Sekolah',
    'Visi dan Misi',
    'Curiculum Vitae',
    'Program Ajar',
    'Kegiatan KBM',
    'Asesmen Pembelajaran',
    'Piloting Sekolah PAIS Berkarakter',
    'Analisa Hasil Asesmen',
    'Pengembangan Diri',
    'Data Siswa',
    'Bank Soal',
    'Pembiasaan Keagamaan',
    'Galeri',
    'Berkas TPG',
  ];
  assert.deepEqual(
    CATEGORIES.map((c) => c.name),
    expectedNames
  );
  const tabNames = new Set(CATEGORIES.map((c) => c.sheetTabName));
  assert.equal(tabNames.size, 14);
  for (const tab of tabNames) {
    assert.ok(tab.length <= 31, `Tab "${tab}" exceeds 31 chars`);
  }
});

test('validateDocumentInput rejects missing required fields and accepts complete data', () => {
  const invalid = validateDocumentInput('berkas-tpg', {
    title: '',
    codeOrRef: 'SK-01',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);

  const valid = validateDocumentInput('berkas-tpg', {
    title: 'SKTP Semester Ganjil',
    codeOrRef: 'SKTP/2026/001',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-09-01',
    status: 'Terverifikasi',
    summary: 'Terverifikasi pada sistem SIAGA.',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);
});

test('calculateTahfidzSummary calculates predicate and Juz 30 percentage accurately', () => {
  const mumtaz = calculateTahfidzSummary(94, 92, JUZ_30_SURAHS.length);
  assert.equal(mumtaz.averageScore, 93);
  assert.equal(mumtaz.predicate, 'Mumtaz');
  assert.equal(mumtaz.completionPercent, 100);

  const jayyidJiddan = calculateTahfidzSummary(84, 82, 19);
  assert.equal(jayyidJiddan.averageScore, 83);
  assert.equal(jayyidJiddan.predicate, 'Jayyid Jiddan');
  assert.equal(jayyidJiddan.completionPercent, 51);

  const badScores = validateDocumentInput('rapor-tahfidz-juz-30', {
    studentName: 'Budi',
    studentClass: 'VI-A',
    codeOrRef: '101',
    surahRange: 'An-Nas s.d. Ad-Duha',
    surahsCompleted: 45,
    tajwidScore: 105,
    fluencyScore: 80,
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-18',
    status: 'Terverifikasi',
    summary: 'Catatan',
  });
  assert.equal(badScores.valid, false);

  const validDataSiswa = validateDocumentInput('data-siswa', {
    title: 'Rekap Data Siswa Kelas IV–VI',
    codeOrRef: 'DS-2026',
    className: 'Kelas I–VI',
    metricValue: '168 Siswa',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-09-01',
    status: 'Terverifikasi',
    summary: 'Daftar siswa PAI terverifikasi.',
  });
  assert.equal(validDataSiswa.valid, true);
  assert.equal(isTahfidzRecord({ title: 'Rekap Data Siswa' }), false);
});

test('CSV export and import round-trip preserves commas and quotes', () => {
  const record = normalizeRecordForCategory('program-ajar', {
    id: 'prog-1',
    title: 'Modul Ajar "Akhlak Terpuji", Fase B',
    codeOrRef: 'MA-01',
    className: 'Kelas IV',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-08-01',
    status: 'Terverifikasi',
    summary: 'Memuat tujuan, langkah KBM, dan rubrik.',
  });

  const rows = buildSpreadsheetSheetRows('program-ajar', [record]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], 'Modul Ajar "Akhlak Terpuji", Fase B');

  const csv = formatRecordsToCsv('program-ajar', [record]);
  const parsed = parseCsvToRecords('program-ajar', csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Modul Ajar "Akhlak Terpuji", Fase B');
  assert.equal(parsed[0].codeOrRef, 'MA-01');
});

test('filterRecords filters by text query and status', () => {
  const r1 = normalizeRecordForCategory('kegiatan-kbm', {
    id: 'kbm-1',
    title: 'Jurnal Shalat Berjamaah',
    codeOrRef: 'KBM-1',
    className: 'Kelas IV-A',
    metricValue: '25/25',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-10-01',
    status: 'Aktif',
    summary: 'Lancar',
  });
  const r2 = normalizeRecordForCategory('kegiatan-kbm', {
    id: 'kbm-2',
    title: 'Jurnal Kisah Teladan Nabi',
    codeOrRef: 'KBM-2',
    className: 'Kelas V-B',
    metricValue: '26/28',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-10-02',
    status: 'Proses',
    summary: 'Diskusi kelompok',
  });

  assert.equal(filterRecords([r1, r2], 'teladan').length, 1);
  assert.equal(filterRecords([r1, r2], '', 'Aktif').length, 1);
  assert.equal(filterRecords([r1, r2], 'shalat', 'Proses').length, 0);
});

test('isValidAppsScriptUrl validates Google Apps Script HTTPS Web App URLs', () => {
  assert.equal(
    isValidAppsScriptUrl('https://script.google.com/macros/s/AKfycbx123/exec'),
    true
  );
  assert.equal(
    isValidAppsScriptUrl('https://script.googleusercontent.com/macros/echo?user=1'),
    true
  );
  assert.equal(isValidAppsScriptUrl('http://script.google.com/macros/s/abc/exec'), false);
  assert.equal(isValidAppsScriptUrl('https://example.com/webhook'), false);
  assert.equal(isValidAppsScriptUrl(''), false);
});

test('buildAppsScriptPayload creates full 14-tab and single-category payloads', () => {
  const sample = normalizeRecordForCategory('berkas-tpg', {
    id: 'tpg-test',
    title: 'SKTP Uji',
    codeOrRef: 'SK-123',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-01',
    status: 'Terverifikasi',
    summary: 'Siap sinkron',
  });

  const full = buildAppsScriptPayload(DEFAULT_PROFILE, [sample]);
  assert.equal(full.action, 'syncAll');
  assert.equal(full.sheets.length, 14);
  assert.equal(full.profileSheet.sheetTabName, 'Profil_Guru');

  const single = buildAppsScriptPayload(DEFAULT_PROFILE, [sample], 'berkas-tpg');
  assert.equal(single.action, 'syncCategory');
  assert.equal(single.sheets.length, 1);
  assert.equal(single.sheets[0].rows.length, 2);
});

test('parseAppsScriptResponse reconstructs teacher profile and records across tabs', () => {
  const customProfile = {
    ...DEFAULT_PROFILE,
    fullName: 'Drs. H. Misbahul Anam, M.Pd.I.',
    nip: '19800101 200501 1 001',
  };
  const tahfidz = normalizeRecordForCategory('rapor-tahfidz-juz-30', {
    id: 'thf-pull-1',
    codeOrRef: '202699',
    studentName: 'Nadia Salma',
    studentClass: 'Kelas VI-B',
    surahRange: 'An-Nas s.d. An-Naba',
    surahsCompleted: 37,
    tajwidScore: 95,
    fluencyScore: 93,
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-20',
    status: 'Terverifikasi',
    summary: 'Mumtaz',
  });
  const payload = buildAppsScriptPayload(customProfile, [tahfidz]);
  const parsed = parseAppsScriptResponse(
    {
      ok: true,
      profileSheet: payload.profileSheet,
      sheets: payload.sheets,
    },
    DEFAULT_PROFILE
  );

  assert.equal(parsed.hasRemoteData, true);
  assert.equal(parsed.profile.fullName, 'Drs. H. Misbahul Anam, M.Pd.I.');
  assert.equal(parsed.profile.nip, '19800101 200501 1 001');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].studentName, 'Nadia Salma');
  assert.equal(parsed.records[0].tahfidzPredicate, 'Mumtaz');
});

test('normalizeExternalPhotoUrl converts Google Drive share URLs into thumbnail image URLs', () => {
  assert.equal(
    normalizeExternalPhotoUrl('https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing'),
    'https://drive.google.com/thumbnail?id=1AbCdEfGhIjK&sz=w1000'
  );
  assert.equal(
    normalizeExternalPhotoUrl('https://example.com/foto.jpg'),
    'https://example.com/foto.jpg'
  );
});

test('validateGameInput and normalizeGameItem enforce game name, link, and screenshot', () => {
  const invalid = validateGameInput({
    title: '',
    gameUrl: 'notaurl',
    screenshotUrl: '',
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);

  const valid = validateGameInput({
    title: 'Kuis Huruf Hijaiyah',
    gameUrl: 'https://wordwall.net/resource/123',
    screenshotUrl: 'https://drive.google.com/file/d/1GameShotID/view',
  });
  assert.equal(valid.valid, true);

  const normalized = normalizeGameItem({
    title: 'Kuis Huruf Hijaiyah',
    gameUrl: 'https://wordwall.net/resource/123',
    screenshotUrl: 'https://drive.google.com/file/d/1GameShotID/view',
  });
  assert.equal(
    normalized.screenshotUrl,
    'https://drive.google.com/thumbnail?id=1GameShotID&sz=w1000'
  );

  const withGames = buildAppsScriptPayload(DEFAULT_PROFILE, [], undefined, [normalized]);
  assert.equal(withGames.gameSheet?.sheetTabName, 'Game_Center');
  const parsed = parseAppsScriptResponse(
    { ok: true, gameSheet: withGames.gameSheet },
    DEFAULT_PROFILE
  );
  assert.equal(parsed.games.length, 1);
  assert.equal(parsed.games[0].title, 'Kuis Huruf Hijaiyah');
});

test('verifyStaticAdminCredentials, client export builders, and resolveAppAssetUrl work accurately', () => {
  assert.equal(verifyStaticAdminCredentials('gpai', 'misbah5758'), true);
  assert.equal(verifyStaticAdminCredentials(' gpai ', 'misbah5758'), true);
  assert.equal(verifyStaticAdminCredentials('gpai', 'wrong'), false);
  assert.equal(verifyStaticAdminCredentials('admin', 'misbah5758'), false);

  const rec = normalizeRecordForCategory('berkas-tpg', {
    id: 'tpg-doc-1',
    title: 'SKTP <Test>',
    codeOrRef: 'SK-99',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-22',
    status: 'Terverifikasi',
    summary: 'Valid & siap cetak',
  });
  const xml = buildExcelWorkbookXml([rec]);
  assert.ok(xml.includes('14_Berkas_TPG'));
  assert.ok(xml.includes('01_Profil_Sekolah'));
  assert.ok(xml.includes('SKTP &lt;Test&gt;'));

  const html = buildPublicDocumentHtml(rec, DEFAULT_PROFILE);
  assert.ok(html.includes('SKTP &lt;Test&gt;'));
  assert.ok(html.includes(DEFAULT_PROFILE.nip));

  assert.equal(
    resolveAppAssetUrl('https://example.com/img.png'),
    'https://example.com/img.png'
  );
  assert.equal(
    resolveAppAssetUrl('/src/assets/images/test.jpg'),
    '/src/assets/images/test.jpg'
  );
});

test('buildAppsScriptPayload and parseAppsScriptResponse preserve updated teacher name and compact uploaded photo', () => {
  const sampleCompactPhoto = `data:image/jpeg;base64,${'A'.repeat(1200)}`;
  const customProfile = {
    ...DEFAULT_PROFILE,
    fullName: 'H. Ahmad Misbahul Munir, M.Pd.',
    nip: '19880514 201903 1 999',
    photoUrl: sampleCompactPhoto,
  };
  const payload = buildAppsScriptPayload(customProfile, []);
  const parsed = parseAppsScriptResponse(
    { ok: true, profileSheet: payload.profileSheet, sheets: payload.sheets },
    DEFAULT_PROFILE
  );
  assert.equal(parsed.profile.fullName, 'H. Ahmad Misbahul Munir, M.Pd.');
  assert.equal(parsed.profile.nip, '19880514 201903 1 999');
  assert.equal(parsed.profile.photoUrl, sampleCompactPhoto);

  const driveProfile = {
    ...DEFAULT_PROFILE,
    photoUrl: 'https://drive.google.com/file/d/1PhotoTestID/view?usp=sharing',
  };
  const drivePayload = buildAppsScriptPayload(driveProfile, []);
  const driveParsed = parseAppsScriptResponse(
    { ok: true, profileSheet: drivePayload.profileSheet },
    DEFAULT_PROFILE
  );
  assert.equal(
    driveParsed.profile.photoUrl,
    'https://drive.google.com/thumbnail?id=1PhotoTestID&sz=w1000'
  );
});

test('buildSpreadsheetSheetRows caps oversized PDF base64 links under 45k chars and round-trips compact image scans', () => {
  const hugePdfDataUrl = `data:application/pdf;base64,${'A'.repeat(120000)}`;
  const compactScanDataUrl = `data:image/jpeg;base64,${'B'.repeat(2400)}`;

  const largePdfRecord = normalizeRecordForCategory('berkas-tpg', {
    id: 'tpg-huge-pdf',
    title: 'SKTP Semester Genap 2026',
    codeOrRef: 'SKTP/2026/099',
    academicYear: '2026/2027',
    semester: 'Genap',
    date: '2026-11-24',
    status: 'Terverifikasi',
    summary: 'SKTP lengkap',
    fileName: 'SKTP-2026.pdf',
    fileUrl: hugePdfDataUrl,
  });

  const compactScanRecord = normalizeRecordForCategory('berkas-tpg', {
    id: 'tpg-scan-img',
    title: 'Foto Scan Sertifikat Pendidik',
    codeOrRef: 'SERDIK/2026/012',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-24',
    status: 'Terverifikasi',
    summary: 'Scan JPG terkompresi',
    fileName: 'serdik-scan.jpg',
    fileUrl: compactScanDataUrl,
  });

  const rows = buildSpreadsheetSheetRows('berkas-tpg', [
    largePdfRecord,
    compactScanRecord,
  ]);
  assert.equal(rows[1][10], 'SKTP-2026.pdf');
  assert.equal(rows[1][11], '');
  assert.equal(rows[2][10], 'serdik-scan.jpg');
  assert.equal(rows[2][11], compactScanDataUrl);

  const payload = buildAppsScriptPayload(
    DEFAULT_PROFILE,
    [largePdfRecord, compactScanRecord],
    'berkas-tpg'
  );
  const parsed = parseAppsScriptResponse(
    { ok: true, sheets: payload.sheets },
    DEFAULT_PROFILE
  );
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].fileName, 'SKTP-2026.pdf');
  assert.equal(parsed.records[0].fileUrl, undefined);
  assert.equal(parsed.records[1].fileName, 'serdik-scan.jpg');
  assert.equal(parsed.records[1].fileUrl, compactScanDataUrl);
});

test('Google Drive ID extraction, preview/download URLs, and Apps Script DriveApp upload code work accurately', () => {
  const driveUrl = 'https://drive.google.com/file/d/1DriveABC123xyz/view?usp=sharing';
  assert.equal(extractGoogleDriveFileId(driveUrl), '1DriveABC123xyz');
  assert.equal(
    buildGoogleDrivePreviewUrl(driveUrl),
    'https://drive.google.com/file/d/1DriveABC123xyz/preview'
  );
  assert.equal(
    buildGoogleDriveDownloadUrl(driveUrl),
    'https://drive.google.com/uc?export=download&id=1DriveABC123xyz'
  );

  const rec = normalizeRecordForCategory('berkas-tpg', {
    id: 'tpg-drive-1',
    title: 'SKTP Google Drive',
    codeOrRef: 'SKTP/DRV/01',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: '2026-11-24',
    status: 'Terverifikasi',
    summary: 'Disimpan di Google Drive',
    fileName: 'sktp-resmi.pdf',
    driveFileId: '1DriveABC123xyz',
    driveViewUrl: driveUrl,
  });

  const payload = buildAppsScriptPayload(DEFAULT_PROFILE, [rec], 'berkas-tpg');
  const parsed = parseAppsScriptResponse({ ok: true, sheets: payload.sheets }, DEFAULT_PROFILE);
  assert.equal(parsed.records[0].driveViewUrl, driveUrl);
  assert.equal(parsed.records[0].driveFileId, '1DriveABC123xyz');
  assert.equal(parsed.records[0].fileName, 'sktp-resmi.pdf');
  assert.ok(APPS_SCRIPT_CODE_TEMPLATE.includes('uploadDriveFile'));
  assert.ok(APPS_SCRIPT_CODE_TEMPLATE.includes('DriveApp'));
  assert.ok(
    APPS_SCRIPT_CODE_TEMPLATE.includes('1GbJOrn4ocpzxaa5omWXS74byughU0v7H')
  );
  assert.ok(APPS_SCRIPT_CODE_TEMPLATE.includes('DriveApp.getFolderById'));
  assert.ok(APPS_SCRIPT_CODE_TEMPLATE.includes('01_Profil_Sekolah'));
  assert.ok(APPS_SCRIPT_CODE_TEMPLATE.includes('14_Berkas_TPG'));
});

test('legacy categoryIds and legacy Google Sheet tabs migrate seamlessly into the 14 canonical categories', () => {
  assert.equal(normalizeCategoryId('kbm'), 'kegiatan-kbm');
  assert.equal(normalizeCategoryId('asesmen-pelajaran'), 'asesmen-pembelajaran');
  assert.equal(normalizeCategoryId('analisis-hasil-asesmen'), 'analisa-hasil-asesmen');
  assert.equal(
    normalizeCategoryId('piloting-sekolah'),
    'piloting-sekolah-pais-berkarakter'
  );
  assert.equal(normalizeCategoryId('rapor-tahfidz-juz-30'), 'data-siswa');

  const legacyParsed = parseAppsScriptResponse(
    {
      ok: true,
      sheets: [
        {
          categoryId: 'berkas-tpg',
          sheetTabName: '01_Berkas_TPG',
          rows: [
            ['ID', 'Judul Dokumen', 'Nomor / Kode Referensi', 'Kelas / Sasaran', 'Capaian', 'Tahun Pelajaran', 'Semester', 'Tanggal', 'Status', 'Ringkasan', 'Nama Berkas', 'Tautan Penyimpanan'],
            ['legacy-tpg-1', 'SKTP Lama', 'SK-01', '', '', '2026/2027', 'Ganjil', '2026-09-01', 'Terverifikasi', 'Aman', 'sktp.pdf', 'https://drive.google.com/file/d/1AbcDrive/view'],
          ],
        },
        {
          categoryId: 'rapor-tahfidz-juz-30',
          sheetTabName: '09_Rapor_Tahfidz_Juz30',
          rows: [
            ['ID', 'NIS / No. Induk', 'Nama Siswa', 'Kelas', 'Rentang Surah Juz 30', 'Jumlah Surah Hafal', 'Nilai Tajwid', 'Nilai Kelancaran', 'Predikat', 'Tahun Pelajaran', 'Semester', 'Tanggal', 'Status', 'Catatan Pembimbing', 'Berkas Rapor'],
            ['legacy-thf-1', '202601', 'Siti Aminah', 'Kelas V-A', 'An-Nas s.d. Al-Ala', '28', '92', '90', 'Mumtaz', '2026/2027', 'Ganjil', '2026-10-01', 'Terverifikasi', 'Baik', 'rapor.pdf'],
          ],
        },
      ],
    },
    DEFAULT_PROFILE
  );

  assert.equal(legacyParsed.records.length, 2);
  assert.equal(legacyParsed.records[0].categoryId, 'berkas-tpg');
  assert.equal(legacyParsed.records[0].driveFileId, '1AbcDrive');
  assert.equal(legacyParsed.records[1].categoryId, 'data-siswa');
  assert.equal(legacyParsed.records[1].studentName, 'Siti Aminah');
  assert.equal(isTahfidzRecord(legacyParsed.records[1]), true);
});
