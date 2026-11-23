import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, JUZ_30_SURAHS } from './categories';
import { DEFAULT_PROFILE } from '../data/seedData';
import {
  buildAppsScriptPayload,
  buildSpreadsheetSheetRows,
  calculateTahfidzSummary,
  filterRecords,
  formatRecordsToCsv,
  isValidAppsScriptUrl,
  normalizeExternalPhotoUrl,
  normalizeGameItem,
  normalizeRecordForCategory,
  parseAppsScriptResponse,
  parseCsvToRecords,
  validateDocumentInput,
  validateGameInput,
} from './spreadsheet';

test('all 9 requested GPAI categories exist with unique sheet tabs', () => {
  assert.equal(CATEGORIES.length, 9);
  const tabNames = new Set(CATEGORIES.map((c) => c.sheetTabName));
  assert.equal(tabNames.size, 9);
  assert.equal(CATEGORIES[0].name, 'Berkas TPG');
  assert.equal(CATEGORIES[8].name, 'Rapor Tahfidz Juz 30');
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
  const r1 = normalizeRecordForCategory('kbm', {
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
  const r2 = normalizeRecordForCategory('kbm', {
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

test('buildAppsScriptPayload creates full 9-tab and single-category payloads', () => {
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
  assert.equal(full.sheets.length, 9);
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
