import { useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { AdminDashboard, DashboardSection } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Navbar } from './components/Navbar';
import { PublicPortal } from './components/PublicPortal';
import { RecordDetailModal } from './components/RecordDetailModal';
import { DEFAULT_PROFILE, DEFAULT_SYNC_INFO, SEED_RECORDS } from './data/seedData';
import {
  initGoogleWorkspaceAuth,
} from './services/googleWorkspace';
import {
  AdminRecord,
  SpreadsheetSyncInfo,
  TeacherProfile,
} from './shared/categories';

export default function App() {
  const [profile, setProfile] = useState<TeacherProfile>(DEFAULT_PROFILE);
  const [records, setRecords] = useState<AdminRecord[]>(SEED_RECORDS);
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

    const loadInitialData = async () => {
      try {
        const [portalRes, sessionRes] = await Promise.all([
          fetch('/api/portal'),
          fetch('/api/auth/session'),
        ]);

        if (active && portalRes.ok) {
          const portalJson = (await portalRes.json()) as {
            profile: TeacherProfile;
            records: AdminRecord[];
            syncInfo: SpreadsheetSyncInfo;
          };
          setProfile(portalJson.profile);
          setRecords(portalJson.records);
          setSyncInfo(portalJson.syncInfo);
        }

        if (active && sessionRes.ok) {
          const sessionJson = (await sessionRes.json()) as {
            authenticated: boolean;
          };
          setIsAuthenticated(sessionJson.authenticated);
        }
      } catch {
        // Fallback already seeded in state
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitialData();

    const unsub = initGoogleWorkspaceAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );

    return () => {
      active = false;
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
    await fetch('/api/auth/logout', { method: 'POST' });
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
          syncInfo={syncInfo}
          googleUser={googleUser}
          initialSection={targetAdminSection}
          onGoogleConnected={(user) => setGoogleUser(user)}
          onGoogleDisconnected={() => setGoogleUser(null)}
          onProfileUpdated={setProfile}
          onRecordsUpdated={setRecords}
          onSyncInfoUpdated={setSyncInfo}
          onSelectRecord={setSelectedRecord}
          onLogout={handleLogout}
        />
      ) : (
        <PublicPortal
          profile={profile}
          records={records}
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
