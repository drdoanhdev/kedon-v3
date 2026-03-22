import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';

export default function Footer() {
  const { currentTenant } = useAuth();
  const router = useRouter();

  // Phím tắt theo trang
  const shortcuts: { key: string; label: string }[] = [];
  if (router.pathname === '/ke-don' || router.pathname === '/ke-don-kinh') {
    shortcuts.push({ key: 'Ctrl+Enter', label: 'Lưu/Cập nhật đơn' });
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100 text-xs z-40 hidden md:block">
      <div className="px-6 lg:px-8 py-1.5 flex items-center justify-between">
        <span className="text-gray-400 font-medium">{currentTenant?.name || ''}</span>
        {shortcuts.length > 0 && (
          <div className="flex items-center gap-4">
            {shortcuts.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-gray-400">
                <kbd className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200 font-mono text-[11px]">{s.key}</kbd>
                <span>{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
