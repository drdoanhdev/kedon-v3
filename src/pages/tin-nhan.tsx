'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';

/** Legacy route: redirect to /thong-bao (owner → support tab). */
export default function TinNhanRedirectPage() {
  const router = useRouter();
  const { currentRole, loading, currentTenantId } = useAuth();

  useEffect(() => {
    if (loading || !currentTenantId) return;
    const href =
      currentRole === 'owner'
        ? '/thong-bao?tab=support'
        : '/thong-bao';
    router.replace(href);
  }, [currentRole, currentTenantId, loading, router]);

  return (
    <ProtectedRoute>
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Đang chuyển hướng...
      </div>
    </ProtectedRoute>
  );
}
