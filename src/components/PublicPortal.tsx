import { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gamepad2,
  Play,
  Search,
  User,
} from 'lucide-react';
import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  GameItem,
  JUZ_30_SURAHS,
  SCHOOL_BANNER_URL,
  SpreadsheetSyncInfo,
  TAHFIDZ_COVER_URL,
  TeacherProfile,
} from '../shared/categories';
import {
  calculateTahfidzSummary,
  filterRecords,
  getCategoryCounts,
} from '../shared/spreadsheet';

interface PublicPortalProps {
  profile: TeacherProfile;
  records: AdminRecord[];
  games: GameItem[];
  syncInfo: SpreadsheetSyncInfo;
  onSelectRecord: (record: AdminRecord) => void;
  onOpenAdmin: () => void;
  onOpenProfileEditor: () => void;
}

type CategoryTabFilter = CategoryId | 'semua';

function StatusCell({ status }: { status: AdminRecord['status'] }) {
  if (status === 'Terverifikasi' || status === 'Aktif') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
      <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
      {status}
    </span>
  );
}

export function PublicPortal({
  profile,
  records,
  games,
  syncInfo,
  onSelectRecord,
  onOpenAdmin,
  onOpenProfileEditor,
}: PublicPortalProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryTabFilter>('semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [photoError, setPhotoError] = useState(false);
  const [failedGameImages, setFailedGameImages] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => getCategoryCounts(records), [records]);
  const activeConfig =
    activeCategory === 'semua' ? null : CATEGORY_MAP[activeCategory];

  const categoryRecords = useMemo(() => {
    if (activeCategory === 'semua') return records;
    return records.filter((r) => r.categoryId === activeCategory);
  }, [records, activeCategory]);

  const filteredRecords = useMemo(
    () => filterRecords(categoryRecords, searchQuery, statusFilter),
    [categoryRecords, searchQuery, statusFilter]
  );

  const tahfidzRecords = useMemo(
    () => records.filter((r) => r.categoryId === 'rapor-tahfidz-juz-30'),
    [records]
  );

  return (
    <main>
      {/* Hero Section: Deep Forest Chalkboard Aesthetic + Pinned Polaroid Profile Card */}
      <section
        id="profil"
        className="relative overflow-hidden bg-[#173828] text-white"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left Column: Editorial Headline, Bio, Quote & Action Buttons */}
            <div className="order-2 lg:order-1 lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/35 bg-[#1E4734] px-3.5 py-1.5 text-xs font-semibold tracking-wider text-[#F2B705] uppercase">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Portal Administrasi GPAI — Digital
              </div>

              <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[56px] [text-wrap:balance]">
                Administrasi Guru
                <span className="mt-1 block text-[#F2B705]">
                  Pendidikan Agama Islam.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#D8E6DD] sm:text-base">
                {profile.bio}
              </p>

              {profile.quote && (
                <blockquote className="mt-6 max-w-xl border-l-2 border-dashed border-[#F2B705]/60 pl-4 font-display text-sm italic text-[#FDE68A] sm:text-base">
                  {profile.quote}
                </blockquote>
              )}

              {/* Primary & Secondary Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <a
                  href="#administrasi"
                  className="inline-flex items-center gap-2 rounded-full bg-[#F2B705] px-6 py-3 text-sm font-bold text-[#173828] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:bg-[#F7C93B] whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  Lihat 9 Berkas Publik
                </a>

                <a
                  href="#tahfidz"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
                >
                  <BookOpen className="h-4 w-4 text-[#F2B705]" aria-hidden="true" />
                  Rapor Tahfidz Juz 30
                </a>

                {syncInfo.spreadsheetUrl ? (
                  <a
                    href={syncInfo.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet
                      className="h-4 w-4 text-emerald-300"
                      aria-hidden="true"
                    />
                    Buka Google Sheet
                  </a>
                ) : (
                  <a
                    href="/api/export/workbook"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet
                      className="h-4 w-4 text-emerald-300"
                      aria-hidden="true"
                    />
                    Unduh Spreadsheet
                  </a>
                )}
              </div>
            </div>

            {/* Right Column: Pinned Tilted Polaroid Profile Card */}
            <div className="order-1 flex justify-center lg:order-2 lg:col-span-5 lg:justify-end">
              <div className="relative w-full max-w-[360px] pt-4">
                {/* Yellow Pushpin & Translucent Tape Accent */}
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-0 z-20 h-7 w-7 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#FDE047] via-[#F2B705] to-[#B45309] shadow-md ring-2 ring-white/30"
                />
                <div
                  aria-hidden="true"
                  className="absolute right-8 top-1 z-10 h-6 w-16 rotate-6 rounded-xs bg-[#FDE047]/45 backdrop-blur-[1px]"
                />

                <div className="rounded-[28px] border border-black/10 bg-white p-4 pb-6 text-slate-900 shadow-2xl transition-transform duration-300 lg:rotate-2 lg:hover:rotate-0">
                  <div className="overflow-hidden rounded-2xl bg-slate-100">
                    {!photoError && profile.photoUrl ? (
                      <img
                        src={profile.photoUrl}
                        alt={`Foto profil ${profile.fullName}`}
                        referrerPolicy="no-referrer"
                        onError={() => setPhotoError(true)}
                        className="aspect-[4/4.4] w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex aspect-[4/4.4] w-full flex-col items-center justify-center bg-gradient-to-br from-emerald-950 to-slate-900 p-6 text-center text-white">
                        <User className="h-14 w-14 text-emerald-300/80" />
                        <p className="mt-3 font-display text-lg font-semibold">
                          {profile.fullName}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-center">
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      {profile.fullName}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {profile.titleRole}
                    </p>
                    <p className="text-xs text-slate-500">{profile.schoolName}</p>

                    <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-600">
                      <span>NIP. {profile.nip}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span>{profile.location}</span>
                    </div>

                    <p className="mt-2 text-[11px] font-semibold text-[#173828]">
                      TPG · Program Ajar · KBM · Asesmen · Tahfidz Juz 30
                    </p>

                    <button
                      type="button"
                      onClick={onOpenProfileEditor}
                      className="mt-3.5 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#173828] hover:bg-slate-100 hover:text-[#173828]"
                    >
                      Ubah Nama, NIP &amp; Foto
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary Strip Directly Below Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-4 lg:gap-6 lg:px-8">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Total Berkas Terbuka Publik
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {records.length} Berkas
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Kategori Administrasi
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              9 / 9 Aktif
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Rapor Tahfidz Juz 30
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {tahfidzRecords.length} Siswa
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Database Spreadsheet
            </p>
            <p className="mt-1 text-base font-semibold text-[#173828]">
              {syncInfo.spreadsheetId
                ? 'Google Sheets Tersinkron'
                : 'Akses Publik & Real-Time'}
            </p>
          </div>
        </div>
      </section>

      {/* 9-Category Public Document Archive */}
      <section id="administrasi" className="py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold text-[#0F6B4E]">
                Akses Terbuka untuk Guru, Siswa, Wali Murid &amp; Pengawas
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Berkas Administrasi Publik (9 Kategori)
              </h2>
            </div>
            <a
              href="/api/export/workbook"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#0F6B4E]" aria-hidden="true" />
              Unduh Workbook Lengkap (.xls)
            </a>
          </div>

          {/* All + 9 Category Selector Grid */}
          <div
            role="tablist"
            aria-label="Pilih kategori berkas publik GPAI"
            className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'semua'}
              onClick={() => {
                setActiveCategory('semua');
                setSearchQuery('');
                setStatusFilter('Semua');
              }}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                activeCategory === 'semua'
                  ? 'border-[#173828] bg-[#173828] text-white'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="text-sm font-semibold">Semua Berkas</span>
              <span
                className={`font-mono text-xs tabular-nums shrink-0 ${
                  activeCategory === 'semua' ? 'text-[#F2B705]' : 'text-slate-500'
                }`}
              >
                {records.length}
              </span>
            </button>

            {CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setSearchQuery('');
                    setStatusFilter('Semua');
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[#173828] bg-[#173828] text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isSelected ? 'text-[#F2B705]' : 'text-slate-400'
                      }`}
                    >
                      {cat.order}.
                    </span>{' '}
                    <span className="text-[13px] font-semibold whitespace-nowrap">
                      {cat.name}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs tabular-nums shrink-0 ${
                      isSelected ? 'text-[#F2B705]' : 'text-slate-500'
                    }`}
                  >
                    {counts[cat.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Public Table */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {activeConfig
                      ? `${activeConfig.order}. ${activeConfig.name}`
                      : 'Semua Berkas Administrasi Publik (9 Kategori)'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {activeConfig
                      ? activeConfig.shortDesc
                      : 'Seluruh dokumen TPG, Program Ajar, KBM, Asesmen, Analisis, Pengembangan Diri, Pembiasaan, Piloting, dan Rapor Tahfidz dapat dilihat dan diunduh langsung oleh masyarakat maupun rekan sejawat.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {activeCategory !== 'semua' && (
                    <a
                      href={`/api/export/csv/${activeCategory}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Ekspor CSV Tab Ini
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#173828] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F291D] whitespace-nowrap shrink-0"
                  >
                    Kelola / Unggah (Admin)
                  </button>
                </div>
              </div>

              {/* Search & Status Filter Toolbar */}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Cari berkas administrasi publik"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeConfig
                        ? `Cari dalam ${activeConfig.name}...`
                        : 'Cari judul berkas, nomor SK, siswa, atau kelas...'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#173828] focus:outline-none focus:ring-2 focus:ring-[#173828]/15"
                  />
                </div>

                <div
                  className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
                  role="group"
                  aria-label="Filter status dokumen"
                >
                  {['Semua', 'Terverifikasi', 'Aktif', 'Proses', 'Draft'].map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          statusFilter === st
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <FileText
                  className="mx-auto h-9 w-9 text-slate-300"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  Belum ada dokumen yang sesuai filter
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Coba ubah kata kunci pencarian atau pilih kategori lainnya.
                </p>
                {(searchQuery || statusFilter !== 'Semua') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('Semua');
                    }}
                    className="mt-4 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      {activeConfig ? (
                        activeConfig.tableColumns.map((col) => (
                          <th
                            key={String(col.key)}
                            className={`px-5 py-3 ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.label}
                          </th>
                        ))
                      ) : (
                        <>
                          <th className="px-5 py-3">Kategori</th>
                          <th className="px-5 py-3">Judul Berkas / Siswa</th>
                          <th className="px-5 py-3">Nomor / Ref</th>
                          <th className="px-5 py-3">Tanggal</th>
                          <th className="px-5 py-3">Status</th>
                        </>
                      )}
                      <th className="px-5 py-3 text-right">Akses Publik</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((item) => {
                      const itemCat = CATEGORY_MAP[item.categoryId];
                      const downloadHref =
                        item.fileUrl ||
                        `/api/public/document/${item.id}?download=1`;

                      return (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-slate-50/80"
                        >
                          {activeConfig ? (
                            activeConfig.tableColumns.map((col) => {
                              const val = item[col.key];
                              if (col.key === 'status') {
                                return (
                                  <td key={String(col.key)} className="px-5 py-3.5">
                                    <StatusCell status={item.status} />
                                  </td>
                                );
                              }
                              if (col.key === 'tahfidzPredicate') {
                                return (
                                  <td
                                    key={String(col.key)}
                                    className="px-5 py-3.5 text-xs font-semibold text-[#0F6B4E]"
                                  >
                                    {item.tahfidzPredicate || '-'}
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={String(col.key)}
                                  className={`px-5 py-3.5 text-slate-700 ${
                                    col.align === 'right'
                                      ? 'text-right'
                                      : 'text-left'
                                  } ${
                                    col.mono
                                      ? 'font-mono text-xs tabular-nums whitespace-nowrap'
                                      : ''
                                  } ${
                                    col.key === 'title' || col.key === 'studentName'
                                      ? 'font-medium text-slate-900'
                                      : ''
                                  }`}
                                >
                                  {val !== undefined && val !== ''
                                    ? String(val)
                                    : '-'}
                                  {(col.key === 'title' ||
                                    col.key === 'studentName') &&
                                    item.fileName && (
                                      <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                                        Berkas: {item.fileName}
                                      </span>
                                    )}
                                </td>
                              );
                            })
                          ) : (
                            <>
                              <td className="px-5 py-3.5 text-xs font-semibold text-[#0F6B4E] whitespace-nowrap">
                                {itemCat.order}. {itemCat.name}
                              </td>
                              <td className="px-5 py-3.5 font-medium text-slate-900">
                                {item.studentName
                                  ? `${item.studentName} (${item.studentClass || '-'})`
                                  : item.title}
                                {item.fileName && (
                                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                                    Berkas: {item.fileName}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                                {item.codeOrRef}
                              </td>
                              <td className="px-5 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                                {item.date}
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusCell status={item.status} />
                              </td>
                            </>
                          )}
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectRecord(item)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#173828]/25 bg-[#173828]/5 px-3 py-1.5 text-xs font-semibold text-[#173828] transition-colors hover:bg-[#173828] hover:text-white whitespace-nowrap shrink-0"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                Lihat Berkas
                              </button>
                              <a
                                href={downloadHref}
                                download={item.fileName || true}
                                aria-label={`Unduh ${item.studentName || item.title}`}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                Unduh
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Rapor Tahfidz Juz 30 & Piloting Budaya Religius Showcase */}
      <section
        id="tahfidz"
        className="border-y border-slate-200 bg-white py-14 sm:py-16"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <img
                  src={TAHFIDZ_COVER_URL}
                  alt="Mushaf Al-Qur'an dan buku catatan pembimbing tahfidz"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <img
                  src={SCHOOL_BANNER_URL}
                  alt="Lingkungan sekolah piloting budaya religius"
                  referrerPolicy="no-referrer"
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7">
              <p className="text-xs font-semibold text-[#0F6B4E]">
                Program Unggulan · {JUZ_30_SURAHS.length} Surah Juz ‘Amma
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Rapor Tahfidz Juz 30 &amp; Piloting Sekolah
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Capaian hafalan peserta didik dicatat per setoran murajaah
                meliputi ketepatan tajwid, makharijul huruf, dan kelancaran
                bacaan dari Surah An-Nas hingga An-Naba. Orang tua, siswa, dan
                wali kelas dapat melihat serta mencetak salinan rapor kapan saja.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {tahfidzRecords.slice(0, 4).map((student) => {
                  const summary = calculateTahfidzSummary(
                    student.tajwidScore || 0,
                    student.fluencyScore || 0,
                    student.surahsCompleted || 0
                  );
                  return (
                    <div
                      key={student.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-[#F8F9FA] p-4"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{student.studentClass}</span>
                          <span className="font-semibold text-[#0F6B4E]">
                            {summary.predicate}
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-sm font-bold text-slate-900">
                          {student.studentName}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600">
                          {student.surahRange}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                        <span className="font-mono text-xs text-slate-600 tabular-nums">
                          {student.surahsCompleted}/37 Surah · Nilai{' '}
                          {summary.averageScore}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectRecord(student)}
                          className="text-xs font-semibold text-[#0F6B4E] hover:underline whitespace-nowrap shrink-0"
                        >
                          Buka Rapor
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Game Center Section */}
      <section id="game-center" className="py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F6B4E]">
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                Media Belajar Interaktif Anak
              </div>
              <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Game Center Edukatif PAI
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Pilih permainan pembelajaran Pendidikan Agama Islam di bawah ini,
                lalu klik tombol <strong>Mainkan</strong> untuk membukanya langsung
                di tab baru.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {syncInfo.spreadsheetUrl && (
                <a
                  href={syncInfo.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Google Sheets Live
                </a>
              )}
              <a
                href="/api/export/workbook"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#0F6B4E]" aria-hidden="true" />
                Unduh Workbook (.xls)
              </a>
            </div>
          </div>

          {games.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Gamepad2 className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Belum ada game edukatif yang ditambahkan.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Admin dapat menambahkan nama game, link game, dan screenshot melalui
                Dashboard Admin.
              </p>
              <button
                type="button"
                onClick={onOpenAdmin}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#173828] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F291D]"
              >
                Kelola Game Center
              </button>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => {
                const imgBroken = Boolean(failedGameImages[game.id]);
                return (
                  <article
                    key={game.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                      {!imgBroken && game.screenshotUrl ? (
                        <img
                          src={game.screenshotUrl}
                          alt={`Screenshot ${game.title}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedGameImages((prev) => ({
                              ...prev,
                              [game.id]: true,
                            }))
                          }
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-[#173828] p-4 text-center text-white">
                          <Gamepad2 className="h-10 w-10 text-[#F2B705]" aria-hidden="true" />
                          <span className="mt-2 text-xs font-medium text-emerald-100">
                            Game Edukatif PAI
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <h3 className="font-display text-lg font-bold leading-snug text-slate-900">
                          {game.title}
                        </h3>
                        <p className="mt-1.5 truncate font-mono text-[11px] text-slate-500">
                          {game.gameUrl}
                        </p>
                      </div>

                      <div className="mt-5 pt-2">
                        <a
                          href={game.gameUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#173828] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0F291D]"
                        >
                          <Play className="h-4 w-4 fill-[#F2B705] text-[#F2B705]" aria-hidden="true" />
                          Mainkan
                          <ExternalLink className="h-3.5 w-3.5 text-emerald-200" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8 print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p>
            &copy; 2026 {profile.fullName} — {profile.schoolName}
          </p>
          <div className="flex items-center gap-5">
            <a href="#profil" className="hover:text-slate-800">
              Profil Guru
            </a>
            <a href="#administrasi" className="hover:text-slate-800">
              Berkas Publik
            </a>
            <a href="#game-center" className="hover:text-slate-800">
              Game Center
            </a>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="font-semibold text-[#173828] hover:underline"
            >
              Akses Admin
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
