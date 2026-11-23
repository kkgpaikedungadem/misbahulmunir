import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, JUZ_30_SURAHS } from './categories';
import {
  buildSpreadsheetSheetRows,
  calculateTahfidzSummary,
  filterRecords,
  formatRecordsToCsv,
  normalizeRecordForCategory,
  parseCsvToRecords,
  validateDocumentInput,
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
