import { useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { AdminDashboard, DashboardSection } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Navbar } from './components/Navbar';
import { PublicPortal } from './components/PublicPortal';
import { RecordDetailModal } from './components/RecordDetailModal';
import {
  DEFAULT_GAMES,
  DEFAULT_PROFILE,
  DEFAULT_SYNC_INFO,
  SEED_RECORDS,
} from './data/seedData';
import {
  initGoogleWorkspaceAuth,
} from './services/googleWorkspace';
import {
  fetchPortalState,
  getAdminSession,
  logoutAdmin,
} from './services/portalClient';
import {
  AdminRecord,
  GameItem,
  SpreadsheetSyncInfo,
  TeacherProfile,
} from './shared/categories';

export default function App() {
  const [profile, setProfile] = useState<TeacherProfile>(DEFAULT_PROFILE);
  const [records, setRecords] = useState<AdminRecord[]>(SEED_RECORDS);
  const [games, setGames] = useState<GameItem[]>(DEFAULT_GAMES);
  const [syncInfo, setSyncInfo] = useState<SpreadsheetSyncInfo>(DEFAULT_SYNC_INFO);
  const [loading, setLoading] = useState(true);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState<'public' | 'admin'>('public');
  const [targetAdminSection, setTargetAdminSection] =
    useState<DashboardSection>('berkas-tpg');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AdminRecord | null>(null);
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    let active = true;
    let lastRefreshAt = 0;

    const fetchLatestPortal = async (forceRemote = false) => {
      try {
        const portalJson = await fetchPortalState(forceRemote);
        if (active) {
          setProfile(portalJson.profile);
          setRecords(portalJson.records);
          setGames(portalJson.games);
          setSyncInfo(portalJson.syncInfo);
          lastRefreshAt = Date.now();
        }
      } catch {
        // Keep current rendered state if network temporarily unavailable
      }
    };

    const loadInitialData = async () => {
      try {
        const [portalJson, sessionJson] = await Promise.all([
          fetchPortalState(false),
          getAdminSession(),
        ]);

        if (active) {
          setProfile(portalJson.profile);
          setRecords(portalJson.records);
          setGames(portalJson.games);
          setSyncInfo(portalJson.syncInfo);
          setIsAuthenticated(sessionJson.authenticated);
          lastRefreshAt = Date.now();
        }
      } catch {
        // Fallback already seeded in state
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastRefreshAt < 15000) return;
      void fetchLatestPortal(true);
    };

    loadInitialData();
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    const unsub = initGoogleWorkspaceAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      unsub();
    };
  }, []);

  const handleOpenAdmin = () => {
    setTargetAdminSection('berkas-tpg');
    if (isAuthenticated) {
      setActiveView('admin');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setLoginModalOpen(true);
    }
  };

  const handleOpenProfileEditor = () => {
    setTargetAdminSection('profil-guru');
    if (isAuthenticated) {
      setActiveView('admin');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setLoginModalOpen(true);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setIsAuthenticated(false);
    setActiveView('public');
  };

  const handleNavigateSection = (sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A]">
      <Navbar
        isAuthenticated={isAuthenticated}
        activeView={activeView}
        onNavigateSection={handleNavigateSection}
        onOpenAdmin={handleOpenAdmin}
        onBackToPublic={() => setActiveView('public')}
      />

      {loading ? (
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-12 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-200" />
            </div>
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200 lg:col-span-5" />
          </div>
        </div>
      ) : activeView === 'admin' && isAuthenticated ? (
        <AdminDashboard
          profile={profile}
          records={records}
          games={games}
          syncInfo={syncInfo}
          googleUser={googleUser}
          initialSection={targetAdminSection}
          onGoogleConnected={(user) => setGoogleUser(user)}
          onGoogleDisconnected={() => setGoogleUser(null)}
          onProfileUpdated={setProfile}
          onRecordsUpdated={setRecords}
          onGamesUpdated={setGames}
          onSyncInfoUpdated={setSyncInfo}
          onSelectRecord={setSelectedRecord}
          onLogout={handleLogout}
        />
      ) : (
        <PublicPortal
          profile={profile}
          records={records}
          games={games}
          syncInfo={syncInfo}
          onSelectRecord={setSelectedRecord}
          onOpenAdmin={handleOpenAdmin}
          onOpenProfileEditor={handleOpenProfileEditor}
        />
      )}

      <AdminLoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={() => {
          setIsAuthenticated(true);
          setLoginModalOpen(false);
          setActiveView('admin');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <RecordDetailModal
        record={selectedRecord}
        profile={profile}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
