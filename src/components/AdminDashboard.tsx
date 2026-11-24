import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Code2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FolderSync,
  Gamepad2,
  Image as ImageIcon,
  Link2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
  DEFAULT_GOOGLE_DRIVE_FOLDER_URL,
  GameItem,
  SpreadsheetSyncInfo,
  TeacherProfile,
  resolveAppAssetUrl,
} from '../shared/categories';
import {
  APPS_SCRIPT_CODE_TEMPLATE,
  filterRecords,
  getCategoryCounts,
  isValidAppsScriptUrl,
  validateDocumentInput,
} from '../shared/spreadsheet';
import {
  createMasterSpreadsheet,
  getGoogleAccessToken,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  syncCategoryTabToGoogleSheet,
  uploadFileToGoogleDrive,
} from '../services/googleWorkspace';
import {
  deleteAdminRecord,
  deleteGameItem,
  formatByteSize,
  importCsvToCategory,
  pullFromAppsScriptClient,
  saveAdminRecord,
  saveGameItem,
  saveTeacherProfile,
  syncToAppsScript,
  triggerCategoryCsvDownload,
  updateSyncInfoState,
  uploadAttachmentViaAppsScript,
} from '../services/portalClient';
import { compressImageFileToDataUrl } from '../utils/imageCompression';
import { ConfirmDialog } from './ConfirmDialog';

interface AdminDashboardProps {
  profile: TeacherProfile;
  records: AdminRecord[];
  games: GameItem[];
  syncInfo: SpreadsheetSyncInfo;
  googleUser: FirebaseUser | null;
  initialSection?: DashboardSection;
  onGoogleConnected: (user: FirebaseUser) => void;
  onGoogleDisconnected: () => void;
  onProfileUpdated: (profile: TeacherProfile) => void;
  onRecordsUpdated: (records: AdminRecord[]) => void;
  onGamesUpdated: (games: GameItem[]) => void;
  onSyncInfoUpdated: (syncInfo: SpreadsheetSyncInfo) => void;
  onSelectRecord: (record: AdminRecord) => void;
  onLogout: () => void;
}

export type DashboardSection =
  | CategoryId
  | 'profil-guru'
  | 'game-center'
  | 'google-sheets';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });
}

function buildEmptyForm(categoryId: CategoryId): Partial<AdminRecord> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    categoryId,
    academicYear: '2026/2027',
    semester: 'Ganjil',
    date: today,
    status: 'Terverifikasi',
  };
}

export function AdminDashboard({
  profile,
  records,
  games,
  syncInfo,
  googleUser,
  initialSection = 'berkas-tpg',
  onGoogleConnected,
  onGoogleDisconnected,
  onProfileUpdated,
  onRecordsUpdated,
  onGamesUpdated,
  onSyncInfoUpdated,
  onSelectRecord,
  onLogout,
}: AdminDashboardProps) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const isGitHubPagesHost =
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.github.io');
  const [formValues, setFormValues] = useState<Partial<AdminRecord>>(() =>
    buildEmptyForm('berkas-tpg')
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Profile editor state
  const [profileForm, setProfileForm] = useState<TeacherProfile>(profile);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(profile.photoUrl);

  // Game Center state
  const [gameTitle, setGameTitle] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [gameScreenshotUrl, setGameScreenshotUrl] = useState('');
  const [gameScreenshotFile, setGameScreenshotFile] = useState<File | null>(null);
  const [gameScreenshotPreview, setGameScreenshotPreview] = useState('');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setProfileForm(profile);
    if (!photoFile) {
      setPhotoPreview(profile.photoUrl);
    }
  }, [profile, photoFile]);

  // Google Workspace & Apps Script state
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState(
    syncInfo.appsScriptUrl || ''
  );
  const [appsScriptBusy, setAppsScriptBusy] = useState(false);
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    setAppsScriptUrlInput(syncInfo.appsScriptUrl || '');
  }, [syncInfo.appsScriptUrl]);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvImportRef = useRef<HTMLInputElement | null>(null);
  const gameFileInputRef = useRef<HTMLInputElement | null>(null);

  const counts = useMemo(() => getCategoryCounts(records), [records]);
  const isCategorySection =
    section !== 'profil-guru' &&
    section !== 'game-center' &&
    section !== 'google-sheets';
  const activeCategoryId: CategoryId = isCategorySection ? section : 'berkas-tpg';
  const activeConfig = CATEGORY_MAP[activeCategoryId];

  const categoryRecords = useMemo(
    () => records.filter((r) => r.categoryId === activeCategoryId),
    [records, activeCategoryId]
  );

  const visibleRecords = useMemo(
    () => filterRecords(categoryRecords, searchQuery, 'Semua'),
    [categoryRecords, searchQuery]
  );

  const switchCategory = (catId: CategoryId) => {
    setSection(catId);
    setEditingId(null);
    setAttachedFile(null);
    setInvalidFields([]);
    setFormValues(buildEmptyForm(catId));
    setSearchQuery('');
    setFeedback(null);
  };

  const handleSaveRecord = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const missingKeys: string[] = [];
    for (const field of activeConfig.fields) {
      if (!field.required) continue;
      const raw = formValues[field.key];
      if (field.type === 'number') {
        if (raw === undefined || raw === null || raw === '' || Number.isNaN(Number(raw))) {
          missingKeys.push(String(field.key));
        }
      } else if (typeof raw !== 'string' || raw.trim().length === 0) {
        missingKeys.push(String(field.key));
      }
    }

    const clientValidation = validateDocumentInput(activeCategoryId, formValues);
    if (!clientValidation.valid || missingKeys.length > 0) {
      setInvalidFields(missingKeys);
      setFeedback({
        type: 'error',
        message:
          clientValidation.errors.join(' ') ||
          'Lengkapi semua kolom wajib bertanda bintang (*) sebelum menyimpan.',
      });
      return;
    }

    setInvalidFields([]);
    setSubmitting(true);

    try {
      let fileUpload: { fileName: string; base64Data: string } | undefined;
      let fileMeta: { fileName?: string; fileSize?: string; fileUrl?: string } = {};
      let driveMeta: { driveFileId?: string; driveViewUrl?: string } = {};
      let driveWarning = '';
      let driveUploaded = false;

      if (formValues.driveViewUrl && formValues.driveViewUrl.trim()) {
        driveMeta.driveViewUrl = formValues.driveViewUrl.trim();
      }

      if (attachedFile) {
        let scriptNeedsUpdate = false;
        const accessToken = getGoogleAccessToken();

        if (accessToken) {
          try {
            const uploadedDrive = await uploadFileToGoogleDrive(
              accessToken,
              activeConfig.name,
              attachedFile,
              DEFAULT_GOOGLE_DRIVE_FOLDER_ID
            );
            driveMeta = {
              driveFileId: uploadedDrive.id,
              driveViewUrl: uploadedDrive.webViewLink,
            };
            fileMeta = {
              fileName: attachedFile.name,
              fileSize: formatByteSize(attachedFile.size),
              fileUrl: '',
            };
            driveUploaded = true;
            if (uploadedDrive.usedFallbackFolder) {
              driveWarning +=
                ' Catatan: akun Google Anda tidak memiliki izin edit ke folder tujuan, sehingga file disimpan di folder "Portal Administrasi GPAI".';
            }
          } catch (driveErr) {
            driveWarning +=
              driveErr instanceof Error
                ? ` Upload Google Drive OAuth gagal (${driveErr.message}).`
                : ' Upload Google Drive OAuth gagal.';
          }
        }

        if (!driveUploaded && syncInfo.appsScriptUrl) {
          try {
            const rawBase64 = await fileToBase64(attachedFile);
            const scriptDrive = await uploadAttachmentViaAppsScript(
              syncInfo.appsScriptUrl,
              activeConfig.name,
              attachedFile.name,
              attachedFile.type,
              rawBase64
            );
            if (scriptDrive.ok && scriptDrive.driveViewUrl) {
              driveMeta = {
                driveFileId: scriptDrive.driveFileId,
                driveViewUrl: scriptDrive.driveViewUrl,
              };
              fileMeta = {
                fileName: attachedFile.name,
                fileSize: formatByteSize(attachedFile.size),
                fileUrl: '',
              };
              driveUploaded = true;
            } else if (scriptDrive.needsCodeUpdate) {
              scriptNeedsUpdate = true;
            } else if (scriptDrive.error) {
              driveWarning += ` Upload Drive Apps Script gagal (${scriptDrive.error}).`;
            }
          } catch {
            // Local fallback below
          }
        }

        if (!driveUploaded && scriptNeedsUpdate && !accessToken) {
          driveWarning +=
            ' Code.gs Apps Script masih versi lama (belum mendukung unggah Drive).';
        }

        if (!driveUploaded) {
          const base64Data = attachedFile.type.startsWith('image/')
            ? await compressImageFileToDataUrl(attachedFile, {
                maxWidth: 900,
                maxHeight: 1200,
                maxChars: 38000,
              })
            : await fileToBase64(attachedFile);
          fileUpload = { fileName: attachedFile.name, base64Data };
        }
      }

      const payload = {
        ...formValues,
        ...fileMeta,
        ...driveMeta,
        categoryId: activeCategoryId,
        ...(fileUpload ? { fileUpload } : {}),
      };

      const data = await saveAdminRecord(payload, editingId);
      if (!data.ok || !data.records) {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menyimpan data ke database.',
        });
        return;
      }

      onRecordsUpdated(data.records);
      if (data.syncInfo) {
        onSyncInfoUpdated(data.syncInfo);
      }

      // Real-time auto-sync to Google Sheets if connected & spreadsheet exists
      const accessToken = getGoogleAccessToken();
      let syncMsg = '';
      if (accessToken && syncInfo.spreadsheetId && syncInfo.autoSyncEnabled) {
        try {
          await syncCategoryTabToGoogleSheet(
            accessToken,
            syncInfo.spreadsheetId,
            activeCategoryId,
            data.records
          );
          const nowIso = new Date().toISOString();
          const syncRes = await updateSyncInfoState({ lastSyncedAt: nowIso });
          if (syncRes.ok && syncRes.syncInfo) {
            onSyncInfoUpdated(syncRes.syncInfo);
          }
          syncMsg = ' & tersinkron real-time ke Google Sheets';
        } catch {
          driveWarning +=
            ' Sinkronisasi Google Sheets langsung dilewati (silakan login Google ulang jika perlu).';
        }
      } else if (data.appsScriptSync?.ok) {
        syncMsg = ' & tersinkron otomatis ke URL Apps Script';
      }

      const driveSavedSuffix = driveUploaded
        ? ' (berkas tersimpan di Google Drive)'
        : '';

      const warnSuffix =
        data.appsScriptSync && !data.appsScriptSync.ok
          ? ` (Catatan Apps Script: ${data.appsScriptSync.message})`
          : '';

      if (attachedFile && !driveUploaded) {
        setFeedback({
          type: 'error',
          message: `Data tabel tersimpan, TETAPI berkas "${attachedFile.name}" BELUM terunggah ke Google Drive.${driveWarning} Klik tombol "Sign in with Google" di formulir unggah (atau salin & Deploy New Version Code.gs di Database Google Sheets), lalu klik Edit pada baris ini untuk mengunggah ulang.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `${
            editingId
              ? `Data ${activeConfig.name} berhasil diperbarui${driveSavedSuffix}${syncMsg}.`
              : `Data & berkas baru berhasil disimpan ke ${activeConfig.name}${driveSavedSuffix}${syncMsg}.`
          }${warnSuffix}${driveWarning}`,
        });
      }
      setEditingId(null);
      setAttachedFile(null);
      setInvalidFields([]);
      setFormValues(buildEmptyForm(activeCategoryId));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat mengunggah data.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requestDeleteRecord = (record: AdminRecord) => {
    setConfirmState({
      open: true,
      title: `Hapus "${record.studentName || record.title}"?`,
      description: `Baris data dari kategori ${activeConfig.name} ini akan dihapus permanen dari database lokal${
        syncInfo.spreadsheetId
          ? ' dan diperbarui pada tab Google Sheets terkait'
          : ''
      }.`,
      confirmLabel: 'Ya, Hapus Data',
      variant: 'danger',
      action: async () => {
        const data = await deleteAdminRecord(record.id);
        if (!data.ok || !data.records) {
          throw new Error(data.error || 'Gagal menghapus data.');
        }
        onRecordsUpdated(data.records);
        if (data.syncInfo) {
          onSyncInfoUpdated(data.syncInfo);
        }

        const accessToken = getGoogleAccessToken();
        if (accessToken && syncInfo.spreadsheetId && syncInfo.autoSyncEnabled) {
          await syncCategoryTabToGoogleSheet(
            accessToken,
            syncInfo.spreadsheetId,
            activeCategoryId,
            data.records
          );
        }
        setFeedback({
          type: 'success',
          message: 'Baris data berhasil dihapus dari database spreadsheet.',
        });
      },
    });
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      let photoUpload: { fileName: string; base64Data: string } | undefined;
      if (photoFile) {
        const base64Data = await compressImageFileToDataUrl(photoFile, {
          maxWidth: 420,
          maxHeight: 540,
          maxChars: 38000,
        });
        photoUpload = { fileName: photoFile.name, base64Data };
      }

      const data = await saveTeacherProfile(profileForm, photoUpload);
      if (!data.ok || !data.profile) {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal memperbarui profil guru.',
        });
        return;
      }
      onProfileUpdated(data.profile);
      if (data.syncInfo) {
        onSyncInfoUpdated(data.syncInfo);
      }
      setProfileForm(data.profile);
      setPhotoPreview(data.profile.photoUrl);
      setPhotoFile(null);
      const syncSuffix = data.appsScriptSync?.ok
        ? ' & tersinkron otomatis ke Google Spreadsheet (semua browser)'
        : '';
      const warnSuffix =
        data.appsScriptSync && !data.appsScriptSync.ok
          ? ` (Catatan Apps Script: ${data.appsScriptSync.message})`
          : '';
      setFeedback({
        type: 'success',
        message: `Profil dan foto guru pada halaman depan berhasil diperbarui${syncSuffix}.${warnSuffix}`,
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyimpan perubahan profil.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetGameForm = () => {
    setEditingGameId(null);
    setGameTitle('');
    setGameUrl('');
    setGameScreenshotUrl('');
    setGameScreenshotFile(null);
    setGameScreenshotPreview('');
    if (gameFileInputRef.current) gameFileInputRef.current.value = '';
  };

  const handleSaveGame = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      let screenshotUpload: { fileName: string; base64Data: string } | undefined;
      if (gameScreenshotFile) {
        const base64Data = await compressImageFileToDataUrl(
          gameScreenshotFile,
          {
            maxWidth: 560,
            maxHeight: 360,
            maxChars: 38000,
          }
        );
        screenshotUpload = { fileName: gameScreenshotFile.name, base64Data };
      }

      const data = await saveGameItem(
        {
          title: gameTitle,
          gameUrl,
          screenshotUrl: gameScreenshotUrl,
          ...(screenshotUpload ? { screenshotUpload } : {}),
        },
        editingGameId
      );
      if (!data.ok || !data.games) {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menyimpan data Game Center.',
        });
        return;
      }

      onGamesUpdated(data.games);
      if (data.syncInfo) {
        onSyncInfoUpdated(data.syncInfo);
      }

      const warnSuffix =
        data.appsScriptSync && !data.appsScriptSync.ok
          ? ` (Catatan Apps Script: ${data.appsScriptSync.message})`
          : '';
      const syncSuffix = data.appsScriptSync?.ok
        ? ' & tersinkron otomatis ke Apps Script'
        : '';

      setFeedback({
        type: 'success',
        message: `${
          editingGameId
            ? `Game "${gameTitle}" berhasil diperbarui${syncSuffix}.`
            : `Game "${gameTitle}" berhasil ditambahkan ke Game Center${syncSuffix}.`
        }${warnSuffix}`,
      });
      resetGameForm();
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyimpan game ke server.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requestDeleteGame = (game: GameItem) => {
    setConfirmState({
      open: true,
      title: `Hapus Game "${game.title}"?`,
      description:
        'Game ini akan dihapus dari daftar Game Center pada halaman depan dan database.',
      confirmLabel: 'Ya, Hapus Game',
      variant: 'danger',
      action: async () => {
        const data = await deleteGameItem(game.id);
        if (!data.ok || !data.games) {
          throw new Error(data.error || 'Gagal menghapus game.');
        }
        onGamesUpdated(data.games);
        if (data.syncInfo) {
          onSyncInfoUpdated(data.syncInfo);
        }
        if (editingGameId === game.id) {
          resetGameForm();
        }
        setFeedback({
          type: 'success',
          message: `Game "${game.title}" berhasil dihapus dari Game Center.`,
        });
      },
    });
  };

  const handleCsvFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const csvText = String(reader.result || '');
      setConfirmState({
        open: true,
        title: `Impor CSV ke ${activeConfig.name}?`,
        description: `Data dari berkas "${file.name}" akan ditambahkan ke dalam tabel kategori ${activeConfig.name}.`,
        confirmLabel: 'Impor Sekarang',
        variant: 'primary',
        action: async () => {
          const data = await importCsvToCategory(activeCategoryId, csvText);
          if (!data.ok || !data.records) {
            throw new Error(data.error || 'Gagal mengimpor berkas CSV.');
          }
          onRecordsUpdated(data.records);
          setFeedback({
            type: 'success',
            message: `${data.importedCount} baris data dari CSV berhasil diimpor ke ${activeConfig.name}.`,
          });
        },
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGoogleLogin = async () => {
    setFeedback(null);
    setGoogleBusy(true);
    try {
      const result = await signInWithGoogleWorkspace();
      onGoogleConnected(result.user);
      const syncJson = await updateSyncInfoState({
        connectedEmail: result.user.email || null,
      });
      if (syncJson.ok && syncJson.syncInfo) {
        onSyncInfoUpdated(syncJson.syncInfo);
      }
      setFeedback({
        type: 'success',
        message: `Akun Google (${result.user.email}) terhubung untuk Google Sheets & Google Drive.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      let friendlyMsg = msg || 'Gagal menghubungkan akun Google Workspace.';
      if (msg.includes('unauthorized-domain')) {
        friendlyMsg =
          'Domain GitHub Pages tidak memakai Sign in with Google langsung. Gunakan kode Apps Script (Code.gs) di menu Database Google Sheets agar unggah Drive & sinkronisasi berjalan otomatis tanpa login Google.';
      } else if (msg.includes('popup-blocked')) {
        friendlyMsg =
          'Popup login Google diblokir oleh browser. Izinkan popup atau gunakan Google Apps Script (Code.gs) agar tetap otomatis tanpa login Google.';
      }
      setFeedback({
        type: 'error',
        message: friendlyMsg,
      });
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleCreateGoogleSpreadsheet = async () => {
    const token = getGoogleAccessToken();
    if (!token) {
      setFeedback({
        type: 'error',
        message: 'Silakan klik "Sign in with Google" terlebih dahulu.',
      });
      return;
    }
    setGoogleBusy(true);
    setFeedback(null);
    try {
      const created = await createMasterSpreadsheet(token, profile, records);
      const nowIso = new Date().toISOString();
      const syncJson = await updateSyncInfoState({
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl,
        lastSyncedAt: nowIso,
        autoSyncEnabled: true,
      });
      if (syncJson.ok && syncJson.syncInfo) {
        onSyncInfoUpdated(syncJson.syncInfo);
      }
      setFeedback({
        type: 'success',
        message:
          'Google Spreadsheet 9 kategori + Profil Guru berhasil dibuat dan diisi secara otomatis!',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal membuat Google Spreadsheet.',
      });
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSyncAppsScript = async (
    e?: FormEvent,
    onlyCategoryId?: CategoryId
  ) => {
    if (e) e.preventDefault();
    setFeedback(null);

    const trimmed = appsScriptUrlInput.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setFeedback({
        type: 'error',
        message:
          'URL Apps Script harus berupa alamat Web App Google yang valid (diawali https://script.google.com/macros/s/.../exec).',
      });
      return;
    }

    setAppsScriptBusy(true);
    try {
      const data = await syncToAppsScript(trimmed, onlyCategoryId);
      if (data.syncInfo) {
        onSyncInfoUpdated(data.syncInfo);
      }
      if (!data.ok) {
        setFeedback({
          type: 'error',
          message:
            data.error ||
            'URL tersimpan, namun gagal menghubungi Google Apps Script Web App.',
        });
        return;
      }
      setFeedback({
        type: 'success',
        message:
          data.message ||
          'URL Apps Script tersimpan dan seluruh tab spreadsheet berhasil disinkronkan!',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Terjadi gangguan jaringan saat mengirim data ke Apps Script.',
      });
    } finally {
      setAppsScriptBusy(false);
    }
  };

  const handleSaveAppsScriptUrlOnly = async () => {
    setFeedback(null);
    const trimmed = appsScriptUrlInput.trim();
    if (trimmed && !isValidAppsScriptUrl(trimmed)) {
      setFeedback({
        type: 'error',
        message:
          'URL Apps Script tidak valid. Harus diawali https://script.google.com/ atau https://script.googleusercontent.com/.',
      });
      return;
    }
    setAppsScriptBusy(true);
    try {
      const data = await updateSyncInfoState({
        appsScriptUrl: trimmed || null,
      });
      if (!data.ok || !data.syncInfo) {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menyimpan URL Apps Script.',
        });
        return;
      }
      onSyncInfoUpdated(data.syncInfo);
      setFeedback({
        type: 'success',
        message: trimmed
          ? 'URL Google Apps Script berhasil disimpan. Sinkronisasi otomatis aktif saat data ditambah/diubah.'
          : 'URL Google Apps Script telah dihapus.',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyimpan konfigurasi Apps Script.',
      });
    } finally {
      setAppsScriptBusy(false);
    }
  };

  const handlePullAppsScript = async () => {
    setFeedback(null);
    const trimmed = appsScriptUrlInput.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setFeedback({
        type: 'error',
        message:
          'Masukkan URL Web App Google Apps Script yang valid terlebih dahulu.',
      });
      return;
    }

    setAppsScriptBusy(true);
    try {
      const data = await pullFromAppsScriptClient(trimmed);
      if (!data.ok) {
        if (data.needsDoGetUpdate) {
          setShowAppsScriptCode(true);
        }
        setFeedback({
          type: 'error',
          message:
            data.error ||
            'Gagal menarik data dari Google Spreadsheet melalui Apps Script.',
        });
        return;
      }
      if (data.profile) onProfileUpdated(data.profile);
      if (data.records) onRecordsUpdated(data.records);
      if (data.games) onGamesUpdated(data.games);
      if (data.syncInfo) onSyncInfoUpdated(data.syncInfo);
      setFeedback({
        type: 'success',
        message:
          data.message ||
          'Data profil, game center, & 9 kategori berhasil ditarik dari Google Spreadsheet!',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Terjadi gangguan jaringan saat menarik data dari Apps Script.',
      });
    } finally {
      setAppsScriptBusy(false);
    }
  };

  const handleCopyAppsScriptCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE_TEMPLATE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyalin kode otomatis. Silakan blok dan salin manual.',
      });
    }
  };

  const requestSyncCategoryToSheets = () => {
    const token = getGoogleAccessToken();
    if (!token || !syncInfo.spreadsheetId) {
      setFeedback({
        type: 'error',
        message:
          'Pastikan Anda sudah Sign in with Google dan membuat Spreadsheet terlebih dahulu.',
      });
      return;
    }

    setConfirmState({
      open: true,
      title: `Sinkronkan Tab ${activeConfig.name}?`,
      description: `Data pada tab "${activeConfig.sheetTabName}" di Google Spreadsheet Anda akan diperbarui agar sama persis dengan ${categoryRecords.length} baris data terbaru.`,
      confirmLabel: 'Ya, Sinkronkan Tab',
      variant: 'primary',
      action: async () => {
        await syncCategoryTabToGoogleSheet(
          token,
          syncInfo.spreadsheetId!,
          activeCategoryId,
          records
        );
        const nowIso = new Date().toISOString();
        const syncJson = await updateSyncInfoState({ lastSyncedAt: nowIso });
        if (syncJson.ok && syncJson.syncInfo) {
          onSyncInfoUpdated(syncJson.syncInfo);
        }
        setFeedback({
          type: 'success',
          message: `Tab ${activeConfig.sheetTabName} berhasil disinkronkan ke Google Sheets.`,
        });
      },
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Operasi gagal dijalankan.',
      });
      setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-20">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-xs font-semibold text-[#0F6B4E]">
                Dashboard Admin Terintegrasi
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">
                {profile.fullName}
              </p>
              <p className="text-xs text-slate-500">User: gpai</p>
            </div>

            <nav aria-label="Menu Admin" className="mt-4 space-y-1">
              <p className="px-2.5 pb-1 text-xs font-semibold text-slate-400">
                Identitas &amp; Sinkronisasi
              </p>

              <button
                type="button"
                onClick={() => {
                  setSection('profil-guru');
                  setFeedback(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                  section === 'profil-guru'
                    ? 'bg-[#0F6B4E] text-white'
                    : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Ubah Nama, NIP &amp; Foto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSection('game-center');
                  setFeedback(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  section === 'game-center'
                    ? 'bg-[#0F6B4E] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Game Center</span>
                </span>
                <span
                  className={`ml-2 font-mono tabular-nums ${
                    section === 'game-center' ? 'text-emerald-100' : 'text-slate-400'
                  }`}
                >
                  {games.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSection('google-sheets');
                  setFeedback(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  section === 'google-sheets'
                    ? 'bg-[#0F6B4E] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Database Google Sheets</span>
              </button>

              <div className="my-3 border-t border-slate-200" />
              <p className="px-2.5 pb-1 text-xs font-semibold text-slate-400">
                9 Kategori Administrasi
              </p>
              {CATEGORIES.map((cat) => {
                const active = section === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => switchCategory(cat.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#0F6B4E] text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">
                      {cat.order}. {cat.name}
                    </span>
                    <span
                      className={`ml-2 font-mono tabular-nums ${
                        active ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      {counts[cat.id]}
                    </span>
                  </button>
                );
              })}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Keluar Dashboard
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* Main Admin Workspace */}
        <section className="space-y-6 lg:col-span-9">
          {feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-xs font-semibold underline"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Category Upload + Spreadsheet Management */}
          {isCategorySection && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-semibold text-[#0F6B4E]">
                      Tab Spreadsheet: {activeConfig.sheetTabName}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                      {activeConfig.order}. {activeConfig.name}
                    </h1>
                    <p className="mt-1 text-xs text-slate-600">
                      {activeConfig.shortDesc}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        triggerCategoryCsvDownload(activeCategoryId, records)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Unduh CSV
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                      <Upload className="h-3.5 w-3.5" />
                      Impor CSV
                      <input
                        ref={csvImportRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleCsvFileSelect}
                        className="sr-only"
                      />
                    </label>
                    {syncInfo.spreadsheetId && googleUser && (
                      <button
                        type="button"
                        onClick={requestSyncCategoryToSheets}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sinkron Google Sheets
                      </button>
                    )}
                    {syncInfo.appsScriptUrl && (
                      <button
                        type="button"
                        disabled={appsScriptBusy}
                        onClick={() => handleSyncAppsScript(undefined, activeCategoryId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F6B4E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B533C] disabled:opacity-60 whitespace-nowrap"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {appsScriptBusy ? 'Menyinkronkan...' : 'Kirim ke Apps Script'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Upload & Entry Form */}
                <form onSubmit={handleSaveRecord} className="mt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">
                      {editingId
                        ? 'Edit Baris Data Administrasi'
                        : `Unggah & Tambah Otomatis ke ${activeConfig.name}`}
                    </h2>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setFormValues(buildEmptyForm(activeCategoryId));
                          setAttachedFile(null);
                        }}
                        className="text-xs font-semibold text-slate-600 hover:underline"
                      >
                        Batal Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {activeConfig.fields.map((field) => {
                      const fieldId = `field-${activeCategoryId}-${String(field.key)}`;
                      const rawValue = formValues[field.key];
                      const value =
                        rawValue !== undefined && rawValue !== null
                          ? String(rawValue)
                          : '';
                      const isInvalid = invalidFields.includes(String(field.key));
                      const fieldBorderClass = isInvalid
                        ? 'border-red-500 ring-2 ring-red-500/15'
                        : 'border-slate-300 focus:border-[#0F6B4E] focus:ring-[#0F6B4E]/15';

                      if (field.type === 'textarea') {
                        return (
                          <div key={String(field.key)} className="sm:col-span-2">
                            <label
                              htmlFor={fieldId}
                              className="block text-xs font-semibold text-slate-700"
                            >
                              {field.label}
                              {field.required && (
                                <span className="text-red-600"> *</span>
                              )}
                            </label>
                            <textarea
                              id={fieldId}
                              rows={3}
                              value={value}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setInvalidFields((prev) =>
                                  prev.filter((k) => k !== String(field.key))
                                );
                                setFormValues((prev) => ({
                                  ...prev,
                                  [field.key]: nextVal,
                                }));
                              }}
                              placeholder={field.placeholder}
                              className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${fieldBorderClass}`}
                            />
                          </div>
                        );
                      }

                      if (field.type === 'select') {
                        return (
                          <div key={String(field.key)}>
                            <label
                              htmlFor={fieldId}
                              className="block text-xs font-semibold text-slate-700"
                            >
                              {field.label}
                              {field.required && (
                                <span className="text-red-600"> *</span>
                              )}
                            </label>
                            <select
                              id={fieldId}
                              value={value || field.options?.[0] || ''}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setInvalidFields((prev) =>
                                  prev.filter((k) => k !== String(field.key))
                                );
                                setFormValues((prev) => ({
                                  ...prev,
                                  [field.key]: nextVal,
                                }));
                              }}
                              className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${fieldBorderClass}`}
                            >
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      return (
                        <div key={String(field.key)}>
                          <label
                            htmlFor={fieldId}
                            className="block text-xs font-semibold text-slate-700"
                          >
                            {field.label}
                            {field.required && (
                              <span className="text-red-600"> *</span>
                            )}
                          </label>
                          <input
                            id={fieldId}
                            type={field.type}
                            value={value}
                            onChange={(e) => {
                              const rawInput = e.target.value;
                              setInvalidFields((prev) =>
                                prev.filter((k) => k !== String(field.key))
                              );
                              setFormValues((prev) => ({
                                ...prev,
                                [field.key]:
                                  field.type === 'number'
                                    ? rawInput === ''
                                      ? undefined
                                      : Number(rawInput)
                                    : rawInput,
                              }));
                            }}
                            placeholder={field.placeholder}
                            className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${fieldBorderClass}`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Auto-Upload File Attachment Box (Google Drive) */}
                  <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <CloudUpload
                          className="h-5 w-5 shrink-0 text-[#0F6B4E]"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            Unggah Berkas ke Google Drive (PDF, DOCX, XLSX, Gambar)
                          </p>
                          <p className="text-xs text-slate-500">
                            {attachedFile
                              ? `Terpilih: ${attachedFile.name} — otomatis disimpan ke Folder Google Drive tujuan.`
                              : formValues.fileName
                              ? `Berkas tersimpan: ${formValues.fileName}${formValues.driveViewUrl ? ' (di Google Drive)' : ''}`
                              : googleUser
                              ? `Google Drive aktif (${googleUser.email}) — file otomatis disimpan ke Folder Google Drive & dibagikan publik.`
                              : isGitHubPagesHost && syncInfo.appsScriptUrl
                              ? 'Mode GitHub Pages aktif — cukup klik "Pilih Berkas" lalu "Simpan", file otomatis masuk Google Drive via Apps Script (tanpa perlu Sign in with Google).'
                              : 'File yang dipilih otomatis dikirim ke Folder Google Drive tujuan via Apps Script (Code.gs) atau akun Google Anda.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={DEFAULT_GOOGLE_DRIVE_FOLDER_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/25 bg-white px-3 py-2 text-xs font-semibold text-[#0F6B4E] hover:bg-emerald-50 whitespace-nowrap"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Folder Drive
                        </a>
                        {isGitHubPagesHost && !syncInfo.appsScriptUrl && (
                          <button
                            type="button"
                            onClick={() => setSection('google-sheets')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                          >
                            Atur URL Apps Script
                          </button>
                        )}
                        {!googleUser && !isGitHubPagesHost && (
                          <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={googleBusy}
                            className="gsi-material-button !h-9 !px-3 !text-xs shrink-0"
                          >
                            <span className="gsi-material-button-icon !h-4 !w-4">
                              <svg className="block" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                <path fill="none" d="M0 0h48v48H0z" />
                              </svg>
                            </span>
                            <span>{googleBusy ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                          </button>
                        )}
                        {attachedFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setAttachedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Batalkan Berkas
                          </button>
                        )}
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0">
                          Pilih Berkas
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                            onChange={(e) =>
                              setAttachedFile(e.target.files?.[0] || null)
                            }
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-slate-200/80 pt-3">
                      <label
                        htmlFor={`field-${activeCategoryId}-driveViewUrl`}
                        className="block text-[11px] font-semibold text-slate-600"
                      >
                        Tautan Google Drive (Terisi Otomatis Setelah Unggah, atau Tempel Manual)
                      </label>
                      <input
                        id={`field-${activeCategoryId}-driveViewUrl`}
                        type="url"
                        value={formValues.driveViewUrl || ''}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            driveViewUrl: e.target.value,
                          }))
                        }
                        placeholder="https://drive.google.com/file/d/... (otomatis terisi saat upload ke Drive)"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none"
                      />
                    </div>
                  </div>

                  {feedback && (
                    <div
                      role={feedback.type === 'error' ? 'alert' : 'status'}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium sm:text-sm ${
                        feedback.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      <span>{feedback.message}</span>
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="shrink-0 text-xs font-semibold underline"
                      >
                        Tutup
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F6B4E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B533C] disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {submitting
                        ? 'Menyimpan & Menyinkronkan...'
                        : editingId
                        ? 'Simpan Perubahan'
                        : 'Simpan & Unggah ke Spreadsheet'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Live Spreadsheet Table for Category */}
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
                  <h2 className="text-sm font-bold text-slate-900">
                    Tabel Data Spreadsheet — {activeConfig.name} ({visibleRecords.length})
                  </h2>
                  <input
                    type="search"
                    aria-label="Filter tabel admin"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari baris..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 sm:w-64 focus:border-[#0F6B4E] focus:outline-none"
                  />
                </div>

                {visibleRecords.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Belum ada data pada kategori ini. Gunakan formulir di atas untuk
                    menambah dokumen pertama.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          {activeConfig.tableColumns.map((col) => (
                            <th
                              key={String(col.key)}
                              className={`px-4 py-3 font-semibold ${
                                col.align === 'right' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right font-semibold">
                            Berkas &amp; Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRecords.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/70">
                            {activeConfig.tableColumns.map((col) => (
                              <td
                                key={String(col.key)}
                                className={`px-4 py-3 text-slate-700 ${
                                  col.align === 'right' ? 'text-right' : 'text-left'
                                } ${col.mono ? 'font-mono tabular-nums whitespace-nowrap' : ''} ${
                                  col.key === 'title' || col.key === 'studentName'
                                    ? 'font-semibold text-slate-900'
                                    : ''
                                }`}
                              >
                                {row[col.key] !== undefined && row[col.key] !== ''
                                  ? String(row[col.key])
                                  : '-'}
                                {(col.key === 'title' || col.key === 'studentName') &&
                                  (row.fileName || row.driveViewUrl) && (
                                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                                      Berkas: {row.fileName || 'Lampiran Google Drive'}
                                      {row.driveViewUrl && (
                                        <span className="ml-1.5 font-semibold text-[#0F6B4E]">
                                          · Google Drive
                                        </span>
                                      )}
                                    </span>
                                  )}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onSelectRecord(row)}
                                  className="rounded border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                                >
                                  Lihat Berkas
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Edit ${row.studentName || row.title}`}
                                  onClick={() => {
                                    setEditingId(row.id);
                                    setFormValues({ ...row });
                                    setAttachedFile(null);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:border-[#0F6B4E] hover:text-[#0F6B4E]"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Hapus ${row.studentName || row.title}`}
                                  onClick={() => requestDeleteRecord(row)}
                                  className="rounded border border-slate-200 p-1.5 text-red-600 hover:border-red-300 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Profile & Photo Editor */}
          {section === 'profil-guru' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="border-b border-slate-200 pb-4">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  Profil &amp; Foto Guru Halaman Depan
                </h1>
                <p className="mt-1 text-xs text-slate-600">
                  Perubahan foto profil dan biodata langsung tampil pada halaman depan
                  website profesional Anda.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="h-32 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img
                      src={resolveAppAssetUrl(photoPreview)}
                      alt="Pratinjau foto profil"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Foto Profil Utama
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Unggah foto langsung atau tempel URL foto / link Google Drive agar tampil konsisten di semua perangkat.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 shrink-0">
                        <Upload className="h-3.5 w-3.5" />
                        Ganti Foto Profil
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setPhotoFile(file);
                            setPhotoPreview(URL.createObjectURL(file));
                          }}
                          className="sr-only"
                        />
                      </label>
                      <div className="flex-1">
                        <label htmlFor="prof-photo-url" className="sr-only">
                          URL Foto Profil (opsional)
                        </label>
                        <input
                          id="prof-photo-url"
                          type="text"
                          value={profileForm.photoUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPhotoFile(null);
                            setProfileForm((p) => ({ ...p, photoUrl: val }));
                            if (val.trim()) setPhotoPreview(val.trim());
                          }}
                          placeholder="Atau tempel URL foto / Google Drive"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="prof-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nama Lengkap &amp; Gelar *
                    </label>
                    <input
                      id="prof-name"
                      type="text"
                      value={profileForm.fullName}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, fullName: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-role"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Jabatan / Mata Pelajaran
                    </label>
                    <input
                      id="prof-role"
                      type="text"
                      value={profileForm.titleRole}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, titleRole: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-school"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Unit Kerja / Sekolah
                    </label>
                    <input
                      id="prof-school"
                      type="text"
                      value={profileForm.schoolName}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, schoolName: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-nip"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      NIP
                    </label>
                    <input
                      id="prof-nip"
                      type="text"
                      value={profileForm.nip}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, nip: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-nuptk"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      NUPTK
                    </label>
                    <input
                      id="prof-nuptk"
                      type="text"
                      value={profileForm.nuptk}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, nuptk: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-email"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Email Resmi
                    </label>
                    <input
                      id="prof-email"
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, email: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-cert"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nomor Sertifikasi / NRG
                    </label>
                    <input
                      id="prof-cert"
                      type="text"
                      value={profileForm.certificationNumber}
                      onChange={(e) =>
                        setProfileForm((p) => ({
                          ...p,
                          certificationNumber: e.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-location"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Lokasi / Kecamatan &amp; Kabupaten
                    </label>
                    <input
                      id="prof-location"
                      type="text"
                      value={profileForm.location}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, location: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="prof-bio"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Ringkasan Profil Profesional
                    </label>
                    <textarea
                      id="prof-bio"
                      rows={3}
                      value={profileForm.bio}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, bio: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="prof-quote"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Motto Pendidik
                    </label>
                    <input
                      id="prof-quote"
                      type="text"
                      value={profileForm.quote}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, quote: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F6B4E] focus:outline-none"
                    />
                  </div>
                </div>

                {feedback && (
                  <div
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium sm:text-sm ${
                      feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    <span>{feedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setFeedback(null)}
                      className="shrink-0 text-xs font-semibold underline"
                    >
                      Tutup
                    </button>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-[#0F6B4E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B533C] disabled:opacity-60"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Profil Guru'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Game Center Management */}
          {section === 'game-center' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h1 className="font-display text-2xl font-bold text-slate-900">
                      Kelola Game Center Edukatif
                    </h1>
                    <p className="mt-1 text-xs text-slate-600">
                      Masukkan nama game, link game, dan screenshot game. Anak didik dapat
                      langsung klik tombol <strong>Mainkan</strong> di halaman depan untuk
                      membuka game di tab baru.
                    </p>
                  </div>
                  {editingGameId && (
                    <button
                      type="button"
                      onClick={resetGameForm}
                      className="text-xs font-semibold text-slate-600 hover:underline self-start sm:self-center"
                    >
                      Batal Edit
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveGame} className="mt-6 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="game-title-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Nama Game <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="game-title-input"
                        type="text"
                        value={gameTitle}
                        onChange={(e) => setGameTitle(e.target.value)}
                        placeholder="Contoh: Kuis Tajwid & Hafalan Juz 30"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none focus:ring-2 focus:ring-[#0F6B4E]/15"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="game-url-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Link Game <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="game-url-input"
                        type="url"
                        value={gameUrl}
                        onChange={(e) => setGameUrl(e.target.value)}
                        placeholder="https://wordwall.net/resource/..."
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none focus:ring-2 focus:ring-[#0F6B4E]/15"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {gameScreenshotPreview ? (
                          <img
                            src={gameScreenshotPreview}
                            alt="Pratinjau screenshot game"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                            <ImageIcon className="h-6 w-6" aria-hidden="true" />
                            <span className="mt-1 text-[11px]">Pratinjau</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-2.5">
                        <p className="text-xs font-semibold text-slate-800">
                          Screenshot Game <span className="text-red-600">*</span>
                        </p>
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0">
                            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                            {gameScreenshotFile
                              ? gameScreenshotFile.name
                              : 'Unggah Screenshot'}
                            <input
                              ref={gameFileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setGameScreenshotFile(file);
                                setGameScreenshotPreview(URL.createObjectURL(file));
                              }}
                              className="sr-only"
                            />
                          </label>
                          <div className="flex-1">
                            <label htmlFor="game-screenshot-url" className="sr-only">
                              URL Screenshot Game (opsional)
                            </label>
                            <input
                              id="game-screenshot-url"
                              type="text"
                              value={gameScreenshotUrl}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGameScreenshotFile(null);
                                setGameScreenshotUrl(val);
                                setGameScreenshotPreview(val.trim());
                              }}
                              placeholder="Atau tempel URL gambar / link Google Drive"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {feedback && (
                    <div
                      role={feedback.type === 'error' ? 'alert' : 'status'}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium sm:text-sm ${
                        feedback.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      <span>{feedback.message}</span>
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="shrink-0 text-xs font-semibold underline"
                      >
                        Tutup
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F6B4E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B533C] disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {submitting
                        ? 'Menyimpan...'
                        : editingGameId
                        ? 'Perbarui Game'
                        : 'Simpan ke Game Center'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-bold text-slate-900">
                  Daftar Game Terpasang ({games.length})
                </h2>

                {games.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    Belum ada game. Gunakan formulir di atas untuk menambahkan game baru.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {games.map((game) => (
                      <div
                        key={game.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"
                      >
                        <div className="aspect-video w-full overflow-hidden bg-slate-200">
                          {game.screenshotUrl ? (
                            <img
                              src={resolveAppAssetUrl(game.screenshotUrl)}
                              alt={`Screenshot ${game.title}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#173828] text-white">
                              <Gamepad2 className="h-8 w-8 text-[#F2B705]" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col justify-between p-4">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">
                              {game.title}
                            </h3>
                            <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                              {game.gameUrl}
                            </p>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                            <a
                              href={game.gameUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#173828] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F291D]"
                            >
                              <Play className="h-3 w-3 fill-[#F2B705] text-[#F2B705]" />
                              Mainkan
                              <ExternalLink className="h-3 w-3" />
                            </a>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`Edit ${game.title}`}
                                onClick={() => {
                                  setEditingGameId(game.id);
                                  setGameTitle(game.title);
                                  setGameUrl(game.gameUrl);
                                  setGameScreenshotUrl(game.screenshotUrl);
                                  setGameScreenshotFile(null);
                                  setGameScreenshotPreview(game.screenshotUrl);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-[#0F6B4E] hover:text-[#0F6B4E]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Hapus ${game.title}`}
                                onClick={() => requestDeleteGame(game)}
                                className="rounded border border-slate-200 bg-white p-1.5 text-red-600 hover:border-red-300 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Google Apps Script, Google Sheets & Google Drive Real-Time Integration */}
          {section === 'google-sheets' && (
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="border-b border-slate-200 pb-4">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  Integrasi Database Spreadsheet &amp; Google Apps Script
                </h1>
                <p className="mt-1 text-xs text-slate-600">
                  Pilih salah satu metode: tempelkan <strong>URL Web App Google Apps Script</strong> Anda di bawah ini, atau masuk langsung menggunakan akun Google Workspace untuk sinkronisasi otomatis 9 tab kategori.
                </p>
              </div>

              {/* Method 1: Google Apps Script Web App URL */}
              <form
                onSubmit={(e) => handleSyncAppsScript(e)}
                className="rounded-xl border border-emerald-200 bg-emerald-50/45 p-5"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0F6B4E] text-white">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        1. Masukkan URL Google Apps Script (Web App)
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Tempel URL deployment Apps Script (<code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-800">https://script.google.com/macros/s/.../exec</code>) agar setiap input/unggah dokumen otomatis masuk ke Google Spreadsheet Anda.
                      </p>
                    </div>
                  </div>
                  {syncInfo.appsScriptUrl && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      URL Terpasang
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="apps-script-url-input"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    URL Web App Google Apps Script
                  </label>
                  <input
                    id="apps-script-url-input"
                    type="url"
                    value={appsScriptUrlInput}
                    onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none focus:ring-2 focus:ring-[#0F6B4E]/15"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={appsScriptBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F6B4E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B533C] disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {appsScriptBusy
                      ? 'Menghubungkan & Mengirim...'
                      : 'Simpan & Sinkronkan Sekarang'}
                  </button>
                  <button
                    type="button"
                    disabled={appsScriptBusy}
                    onClick={handlePullAppsScript}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F6B4E] hover:bg-emerald-50 disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tarik dari Spreadsheet
                  </button>
                  <button
                    type="button"
                    disabled={appsScriptBusy}
                    onClick={handleSaveAppsScriptUrlOnly}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Simpan URL Saja
                  </button>
                  {syncInfo.appsScriptUrl && (
                    <button
                      type="button"
                      disabled={appsScriptBusy}
                      onClick={() => {
                        setAppsScriptUrlInput('');
                        void (async () => {
                          const data = await updateSyncInfoState({
                            appsScriptUrl: null,
                            disconnectedByUser: true,
                          });
                          if (data.ok && data.syncInfo) {
                            onSyncInfoUpdated(data.syncInfo);
                            setFeedback({
                              type: 'success',
                              message: 'URL Apps Script berhasil dihapus.',
                            });
                          }
                        })();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Hapus URL
                    </button>
                  )}
                  <a
                    href={DEFAULT_GOOGLE_DRIVE_FOLDER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/25 bg-white px-3 py-2 text-xs font-semibold text-[#0F6B4E] hover:bg-emerald-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Buka Folder Drive
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowAppsScriptCode((prev) => !prev)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    {showAppsScriptCode
                      ? 'Sembunyikan Kode Code.gs'
                      : 'Lihat Kode Code.gs Siap Pakai'}
                  </button>
                </div>

                {showAppsScriptCode && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-900 p-4 text-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2.5">
                      <p className="text-xs font-medium text-slate-300">
                        Salin kode ini ke Google Spreadsheet → Ekstensi → Apps Script → Deploy sebagai Web App (Akses: Anyone / Siapa saja)
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyAppsScriptCode}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Salin Code.gs
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="mt-3 max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-emerald-200">
                      {APPS_SCRIPT_CODE_TEMPLATE}
                    </pre>
                  </div>
                )}
              </form>

              {/* Method 2: Direct Google Workspace OAuth */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      2. Koneksi Langsung via Google Workspace (OAuth)
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {googleUser
                        ? `Terhubung sebagai ${googleUser.email}`
                        : isGitHubPagesHost
                        ? `Di domain GitHub Pages (${window.location.hostname}), cukup gunakan Metode 1 (Apps Script) di atas—unggah Google Drive & sinkronisasi Spreadsheet langsung aktif tanpa Sign in with Google. (Jika ingin memakai tombol ini di GitHub Pages, tambahkan "${window.location.hostname}" pada Authorized domains di Firebase Console.)`
                        : 'Alternatif tanpa Apps Script: buat Spreadsheet 9 tab & unggah berkas ke Google Drive langsung dengan akun Google.'}
                    </p>
                  </div>

                  {!googleUser ? (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={googleBusy}
                      className="gsi-material-button shrink-0"
                    >
                      <span className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      </span>
                      <span>
                        {googleBusy ? 'Menghubungkan...' : 'Sign in with Google'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await signOutGoogleWorkspace();
                        onGoogleDisconnected();
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Putuskan Sesi Google
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-semibold text-slate-500">
                    Spreadsheet Master (9 Tab Kategori)
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-slate-900">
                    {syncInfo.spreadsheetId
                      ? 'Spreadsheet OAuth Terhubung'
                      : syncInfo.appsScriptUrl
                        ? 'Terhubung via Google Apps Script'
                        : 'Belum Ada Spreadsheet Google Terhubung'}
                  </p>
                  {syncInfo.spreadsheetId && (
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">
                      ID: {syncInfo.spreadsheetId}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!googleUser || googleBusy}
                      onClick={handleCreateGoogleSpreadsheet}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F6B4E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B533C] disabled:opacity-50"
                    >
                      <FolderSync className="h-3.5 w-3.5" />
                      {syncInfo.spreadsheetId
                        ? 'Buat Spreadsheet Baru'
                        : 'Buat Spreadsheet 9 Tab Otomatis'}
                    </button>
                    {syncInfo.spreadsheetUrl && (
                      <a
                        href={syncInfo.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Buka Google Sheets
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-semibold text-slate-500">
                    Unggah &amp; Sinkronisasi Otomatis Real-Time
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-[#0F6B4E]" />
                      {syncInfo.autoSyncEnabled ? 'Aktif Otomatis' : 'Manual'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const data = await updateSyncInfoState({
                          autoSyncEnabled: !syncInfo.autoSyncEnabled,
                        });
                        if (data.ok && data.syncInfo) {
                          onSyncInfoUpdated(data.syncInfo);
                        }
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {syncInfo.autoSyncEnabled ? 'Matikan Auto' : 'Aktifkan Auto'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {syncInfo.lastSyncedAt
                      ? `Sinkronisasi terakhir: ${new Date(
                          syncInfo.lastSyncedAt
                        ).toLocaleString('id-ID')}`
                      : 'Unduhan langsung Excel (.xls 9 tab) dan CSV per kategori tetap selalu tersedia.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState?.open)}
        title={confirmState?.title || ''}
        description={confirmState?.description || ''}
        confirmLabel={confirmState?.confirmLabel || 'Konfirmasi'}
        variant={confirmState?.variant || 'primary'}
        busy={confirmBusy}
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
