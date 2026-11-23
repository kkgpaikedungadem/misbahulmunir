function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk kompresi.'));
    img.src = src;
  });
}

export async function compressImageDataUrlToLimit(
  rawDataUrl: string,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    maxChars?: number;
  }
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 420;
  const maxHeight = options?.maxHeight ?? 540;
  const maxChars = options?.maxChars ?? 38000;

  if (!rawDataUrl || rawDataUrl.length <= maxChars) {
    return rawDataUrl;
  }

  if (typeof document === 'undefined') {
    return rawDataUrl;
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const srcW = img.naturalWidth || img.width || maxWidth;
    const srcH = img.naturalHeight || img.height || maxHeight;
    let scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    let bestResult = rawDataUrl;
    for (let dimAttempt = 0; dimAttempt < 5; dimAttempt++) {
      const targetW = Math.max(80, Math.round(srcW * scale));
      const targetH = Math.max(80, Math.round(srcH * scale));
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const quality of [0.84, 0.72, 0.6, 0.48, 0.36]) {
        const candidate = canvas.toDataURL('image/jpeg', quality);
        bestResult = candidate;
        if (candidate.length <= maxChars) {
          return candidate;
        }
      }
      scale *= 0.75;
    }

    return bestResult;
  } catch {
    return rawDataUrl;
  }
}

export async function compressImageFileToDataUrl(
  file: File,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    maxChars?: number;
  }
): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  if (!file.type.startsWith('image/')) {
    return rawDataUrl;
  }
  return compressImageDataUrlToLimit(rawDataUrl, options);
}
