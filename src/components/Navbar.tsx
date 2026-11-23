interface NavbarProps {
  isAuthenticated: boolean;
  activeView: 'public' | 'admin';
  onNavigateSection: (sectionId: string) => void;
  onOpenAdmin: () => void;
  onBackToPublic: () => void;
}

export function Navbar({
  isAuthenticated,
  activeView,
  onNavigateSection,
  onOpenAdmin,
  onBackToPublic,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#FAF9F5]/95 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Emblem + Wordmark */}
        <a
          href="#profil"
          onClick={(e) => {
            e.preventDefault();
            if (activeView === 'admin') {
              onBackToPublic();
            }
            onNavigateSection('profil');
          }}
          className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#173828] font-mono text-xs font-bold text-[#F2B705]">
            GP
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[#173828]">
            Portal GPAI
          </span>
        </a>

        {/* Zone 2: 4 Single-Line Nav Links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <a
            href="#profil"
            onClick={(e) => {
              e.preventDefault();
              if (activeView === 'admin') onBackToPublic();
              onNavigateSection('profil');
            }}
            className="transition-colors hover:text-[#173828] whitespace-nowrap shrink-0"
          >
            Profil
          </a>
          <a
            href="#administrasi"
            onClick={(e) => {
              e.preventDefault();
              if (activeView === 'admin') onBackToPublic();
              onNavigateSection('administrasi');
            }}
            className="transition-colors hover:text-[#173828] whitespace-nowrap shrink-0"
          >
            Berkas Publik
          </a>
          <a
            href="#tahfidz"
            onClick={(e) => {
              e.preventDefault();
              if (activeView === 'admin') onBackToPublic();
              onNavigateSection('tahfidz');
            }}
            className="transition-colors hover:text-[#173828] whitespace-nowrap shrink-0"
          >
            Rapor Tahfidz
          </a>
          <a
            href="#game-center"
            onClick={(e) => {
              e.preventDefault();
              if (activeView === 'admin') onBackToPublic();
              onNavigateSection('game-center');
            }}
            className="transition-colors hover:text-[#173828] whitespace-nowrap shrink-0"
          >
            Game Center
          </a>
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          {activeView === 'admin' ? (
            <button
              type="button"
              onClick={onBackToPublic}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Lihat Halaman Depan
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="rounded-lg bg-[#173828] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F291D] whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Dashboard Admin' : 'Login Admin'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
