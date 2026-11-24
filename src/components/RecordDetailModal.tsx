import {
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { triggerDocumentDownload } from '../services/portalClient';
import {
  AdminRecord,
  CATEGORY_MAP,
  TeacherProfile,
  getAppBaseUrl,
  normalizeCategoryId,
  resolveAppAssetUrl,
} from '../shared/categories';
import {
  buildGoogleDrivePreviewUrl,
  buildPublicDocumentHtml,
  calculateTahfidzSummary,
  isTahfidzRecord,
} from '../shared/spreadsheet';

interface RecordDetailModalProps {
  record: AdminRecord | null;
  profile: TeacherProfile;
  onClose: () => void;
}

function isImageUrl(url: string | undefined, fileName: string | undefined): boolean {
  const lowerUrl = (url || '').toLowerCase();
  if (lowerUrl.startsWith('data:image/')) return true;
  const lowerName = (fileName || '').toLowerCase();
  return (
    /\.(png|jpe?g|webp|gif)(\?.*)?$/.test(lowerUrl) ||
    /\.(png|jpe?g|webp|gif)$/.test(lowerName)
  );
}

function isPdfUrl(url: string | undefined, fileName: string | undefined): boolean {
  const lowerUrl = (url || '').toLowerCase();
  if (lowerUrl.startsWith('data:application/pdf')) return true;
  const lowerName = (fileName || '').toLowerCase();
  return /\.pdf(\?.*)?$/.test(lowerUrl) || /\.pdf$/.test(lowerName);
}

export function RecordDetailModal({
  record,
  profile,
  onClose,
}: RecordDetailModalProps) {
  const [showInlinePreview, setShowInlinePreview] = useState(true);
  const [fileLoadError, setFileLoadError] = useState(false);

  useEffect(() => {
    setShowInlinePreview(true);
    setFileLoadError(false);
  }, [record?.id]);

  if (!record) return null;

  const category = CATEGORY_MAP[normalizeCategoryId(record.categoryId)];
  const isTahfidz = isTahfidzRecord(record);
  const tahfidzSummary = isTahfidz
    ? calculateTahfidzSummary(
        record.tajwidScore || 0,
        record.fluencyScore || 0,
        record.surahsCompleted || 0
      )
    : null;

  const drivePreviewUrl = buildGoogleDrivePreviewUrl(
    record.driveViewUrl,
    record.driveFileId
  );
  const isUnreachableApiFile = Boolean(
    record.fileUrl?.startsWith('/api/') &&
      typeof window !== 'undefined' &&
      (window.location.hostname.endsWith('.github.io') || getAppBaseUrl() !== '/')
  );
  const effectiveFileUrl =
    !isUnreachableApiFile && !fileLoadError && record.fileUrl
      ? resolveAppAssetUrl(record.fileUrl)
      : undefined;

  const hasUploadedBinary = Boolean(effectiveFileUrl);
  const hasUploadedAsset = Boolean(
    effectiveFileUrl || drivePreviewUrl || record.fileName
  );
  const isImage = isImageUrl(effectiveFileUrl, record.fileName);
  const isPdf = isPdfUrl(effectiveFileUrl, record.fileName);
  const inlineHtmlDoc = buildPublicDocumentHtml(record, profile);

  const fileAccessSection = (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {effectiveFileUrl || drivePreviewUrl ? (
            <FileCheck2 className="h-5 w-5 shrink-0 text-[#0F6B4E]" />
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-[#0F6B4E]" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {record.fileName ||
                (drivePreviewUrl
                  ? 'Berkas Lampiran Google Drive'
                  : 'Lembar Dokumen Resmi GPAI')}
            </p>
            <p className="text-xs text-slate-500">
              {record.fileSize || 'Siap dilihat & diunduh publik'}
              {drivePreviewUrl ? ' · Tersimpan di Google Drive' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInlinePreview((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-100"
          >
            <Eye className="h-3.5 w-3.5" />
            {showInlinePreview ? 'Sembunyikan File' : 'Tampilkan File'}
          </button>
          <button
            type="button"
            onClick={() => triggerDocumentDownload(record, profile)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#173828] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#0F291D]"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Berkas
          </button>
          {record.driveViewUrl && (
            <a
              href={record.driveViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buka di Drive
            </a>
          )}
        </div>
      </div>

      {showInlinePreview && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {hasUploadedBinary && isImage ? (
            <img
              src={effectiveFileUrl}
              alt={`Berkas ${record.fileName || record.title}`}
              referrerPolicy="no-referrer"
              onError={() => setFileLoadError(true)}
              className="max-h-[480px] w-full bg-slate-100 object-contain"
            />
          ) : hasUploadedBinary && isPdf ? (
            <iframe
              title={`Berkas PDF ${record.fileName || record.title}`}
              src={effectiveFileUrl}
              className="h-[440px] w-full border-0 sm:h-[500px]"
            />
          ) : drivePreviewUrl ? (
            <iframe
              title={`Pratinjau Google Drive ${record.fileName || record.title}`}
              src={drivePreviewUrl}
              allow="autoplay"
              className="h-[440px] w-full border-0 sm:h-[500px]"
            />
          ) : hasUploadedBinary ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <FileCheck2 className="h-10 w-10 text-[#0F6B4E]" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {record.fileName || 'Berkas Terunggah'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Format berkas ini siap diunduh langsung dalam format aslinya ({record.fileSize || 'ukuran tersedia'}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerDocumentDownload(record, profile)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#173828] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F291D]"
              >
                <Download className="h-4 w-4" />
                Unduh &amp; Buka File Asli
              </button>
            </div>
          ) : record.fileName ? (
            <div>
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                Nama file terlampir (<strong>{record.fileName}</strong>), namun tautan pratinjau Google Drive belum tersedia pada entri ini. Menampilkan ringkasan dokumen resmi:
              </div>
              <iframe
                title={`Pratinjau Lembar Dokumen ${record.title}`}
                srcDoc={inlineHtmlDoc}
                className="h-[280px] w-full border-0"
              />
            </div>
          ) : (
            <iframe
              title={`Pratinjau Lembar Dokumen ${record.title}`}
              srcDoc={inlineHtmlDoc}
              className="h-[280px] w-full border-0"
            />
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8 print:max-h-none print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-[#0F6B4E]">
                {category.order}. {category.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{record.codeOrRef}</span>
              <span aria-hidden="true">·</span>
              <span>
                {record.academicYear} ({record.semester})
              </span>
            </div>
            <h3
              id="detail-modal-title"
              className="mt-2 font-display text-xl font-bold text-slate-900 sm:text-2xl"
            >
              {isTahfidz
                ? `Rapor Tahfidz Juz 30 — ${record.studentName}`
                : record.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail dokumen"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 print:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Display uploaded file first whenever a file or Drive link is attached */}
        {hasUploadedAsset && fileAccessSection}

        {isTahfidz && tahfidzSummary ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Kelas</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {record.studentClass}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Surah Hafal</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {record.surahsCompleted} / 37 ({tahfidzSummary.completionPercent}%)
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rata-rata Nilai</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {tahfidzSummary.averageScore}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Predikat</p>
                <p className="mt-1 text-sm font-bold text-[#0F6B4E]">
                  {tahfidzSummary.predicate}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Rentang Surah Juz 30</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {record.surahRange}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Nilai Tajwid &amp; Makhraj</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {record.tajwidScore}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Nilai Kelancaran</p>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {record.fluencyScore}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {record.className && (
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-xs text-slate-500">Kelas / Sasaran</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {record.className}
                </p>
              </div>
            )}
            {record.metricValue && (
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-xs text-slate-500">
                  Capaian / Keterangan Teknis
                </p>
                <p className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                  {record.metricValue}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Tanggal Dokumen</p>
              <p className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {record.date}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Status Validasi</p>
              <p className="mt-1 text-sm font-semibold text-[#0F6B4E]">
                {record.status}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="text-xs font-medium text-slate-500">
            {isTahfidz
              ? 'Catatan Pembimbing Tahfidz'
              : 'Ringkasan & Deskripsi Dokumen'}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
            {record.summary}
          </p>
        </div>

        {/* Fallback document preview when record has no attached file */}
        {!hasUploadedAsset && fileAccessSection}

        <div className="mt-6 hidden border-t border-slate-200 pt-5 print:flex print:justify-between">
          <div className="text-xs text-slate-600">
            <p>{profile.schoolName}</p>
            <p>{profile.location}</p>
          </div>
          <div className="text-right text-xs text-slate-800">
            <p>Guru Pembimbing PAI,</p>
            <p className="mt-8 font-semibold">{profile.fullName}</p>
            <p className="font-mono">NIP. {profile.nip}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-5 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            {isTahfidz ? 'Cetak Rapor' : 'Cetak Lembar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:bg-slate-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
