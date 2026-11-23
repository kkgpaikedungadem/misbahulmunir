import { FormEvent, useState } from 'react';
import { Lock, X } from 'lucide-react';

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export function AdminLoginModal({
  open,
  onClose,
  onLoginSuccess,
}: AdminLoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Username dan password admin wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { authenticated?: boolean; error?: string };
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Login gagal. Periksa kembali kredensial Anda.');
        return;
      }
      setUsername('');
      setPassword('');
      onLoginSuccess();
    } catch {
      setError('Terjadi gangguan jaringan saat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-login-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F6B4E]/10 text-[#0F6B4E]">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="admin-login-title"
                className="font-display text-xl font-bold text-slate-900"
              >
                Login Dashboard Admin
              </h2>
              <p className="text-xs text-slate-500">
                Akses pengelolaan 9 kategori dokumen & database spreadsheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form login"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="admin-username"
              className="block text-sm font-medium text-slate-700"
            >
              Username Admin
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Masukkan username admin"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none focus:ring-2 focus:ring-[#0F6B4E]/20"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password admin"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F6B4E] focus:outline-none focus:ring-2 focus:ring-[#0F6B4E]/20"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#0F6B4E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B533C] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {submitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
