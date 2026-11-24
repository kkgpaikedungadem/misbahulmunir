import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AdminRecord,
  CATEGORIES,
  CATEGORY_MAP,
  CategoryId,
  DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
  TeacherProfile,
} from '../shared/categories';
import { buildSpreadsheetSheetRows } from '../shared/spreadsheet';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}

// Strict in-memory token cache (never localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal memperoleh akses token Google Workspace.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

async function ensureFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const query = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as { files?: { id: string }[] };
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  if (!createRes.ok) {
    throw new Error('Gagal membuat folder kategori di Google Drive.');
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function performDriveMultipartUpload(
  accessToken: string,
  parentFolderId: string,
  file: File
): Promise<Response> {
  const boundary =
    'gpai_drive_upload_' +
    Date.now() +
    '_' +
    Math.random().toString(36).slice(2);
  const mimeType = file.type || 'application/octet-stream';
  const metadataJson = JSON.stringify({
    name: file.name,
    mimeType,
    parents: [parentFolderId],
  });

  const headerPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const footerPart = `\r\n--${boundary}--`;
  const fileBuffer = await file.arrayBuffer();
  const bodyBlob = new Blob([headerPart, fileBuffer, footerPart], {
    type: `multipart/related; boundary=${boundary}`,
  });

  return fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    }
  );
}

export async function uploadFileToGoogleDrive(
  accessToken: string,
  categoryName: string,
  file: File,
  targetFolderId: string = DEFAULT_GOOGLE_DRIVE_FOLDER_ID
): Promise<{
  id: string;
  name: string;
  webViewLink: string;
  usedFallbackFolder?: boolean;
}> {
  let usedFallbackFolder = false;
  let uploadRes = await performDriveMultipartUpload(
    accessToken,
    targetFolderId,
    file
  );

  // If the signed-in account does not have edit permission on the target folder ID,
  // fall back to an app-created folder rather than failing completely.
  if (!uploadRes.ok && (uploadRes.status === 403 || uploadRes.status === 404)) {
    const rootFolderId = await ensureFolder(accessToken, 'Portal Administrasi GPAI');
    const categoryFolderId = await ensureFolder(accessToken, categoryName, rootFolderId);
    uploadRes = await performDriveMultipartUpload(
      accessToken,
      categoryFolderId,
      file
    );
    usedFallbackFolder = true;
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gagal mengunggah ke Google Drive: ${errText}`);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  // Allow anyone with the link to view/download so public visitors can inspect the file
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
  } catch {
    // Non-fatal if organization restricts public sharing
  }

  return {
    id: uploaded.id,
    name: uploaded.name,
    webViewLink:
      uploaded.webViewLink ||
      `https://drive.google.com/file/d/${uploaded.id}/view?usp=sharing`,
    usedFallbackFolder,
  };
}

export async function createMasterSpreadsheet(
  accessToken: string,
  profile: TeacherProfile,
  records: AdminRecord[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheetProperties = [
    { properties: { title: 'Profil_Guru' } },
    ...CATEGORIES.map((cat) => ({
      properties: { title: cat.sheetTabName },
    })),
  ];

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: `Database Administrasi GPAI — ${profile.fullName}`,
      },
      sheets: sheetProperties,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Gagal membuat Google Spreadsheet: ${errText}`);
  }

  const created = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };

  const valueRanges = [
    {
      range: 'Profil_Guru!A1',
      values: [
        ['Atribut', 'Informasi Guru'],
        ['Nama Lengkap', profile.fullName],
        ['Jabatan', profile.titleRole],
        ['Unit Kerja', profile.schoolName],
        ['NIP', profile.nip],
        ['NUPTK', profile.nuptk],
        ['Sertifikasi', profile.certificationNumber],
        ['Email', profile.email],
        ['Lokasi', profile.location],
        ['Diperbarui', profile.updatedAt],
      ],
    },
    ...CATEGORIES.map((cat) => ({
      range: `${cat.sheetTabName}!A1`,
      values: buildSpreadsheetSheetRows(
        cat.id,
        records.filter((r) => r.categoryId === cat.id)
      ),
    })),
  ];

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      }),
    }
  );

  if (!batchRes.ok) {
    const errText = await batchRes.text();
    throw new Error(`Spreadsheet dibuat, namun gagal mengisi data awal: ${errText}`);
  }

  return created;
}

export async function syncCategoryTabToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  categoryId: CategoryId,
  allRecords: AdminRecord[]
): Promise<void> {
  const config = CATEGORY_MAP[categoryId];
  if (!config) return;

  // Check spreadsheet metadata first (best practice: avoid assuming tab exists)
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    throw new Error('Tidak dapat mengakses spreadsheet target. Periksa izin atau ID spreadsheet.');
  }

  const meta = (await metaRes.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const titles = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean)
  );

  if (!titles.has(config.sheetTabName)) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: config.sheetTabName } } }],
        }),
      }
    );
  }

  const clearRange = encodeURIComponent(`${config.sheetTabName}!A1:Z1000`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const rows = buildSpreadsheetSheetRows(
    categoryId,
    allRecords.filter((r) => r.categoryId === categoryId)
  );

  const updateRange = encodeURIComponent(`${config.sheetTabName}!A1`);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${config.sheetTabName}!A1`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Gagal menyinkronkan tab ${config.name}: ${errText}`);
  }
}
