import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

interface TrialInfo {
  plan: string;
  trial: {
    daysRemaining: number;
    totalDays: number;
    usedPrescriptions: number;
    maxPrescriptions: number;
    prescriptionsRemaining: number;
    isExpired: boolean;
  };
}

function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const { currentTenantId } = useAuth();

  useEffect(() => {
    if (!currentTenantId) return;
    const fetchTrial = async () => {
      try {
        const { getAuthHeaders } = await import('../lib/fetchWithAuth');
        const headers = await getAuthHeaders();
        const res = await fetch('/api/tenants/trial', { headers });
        if (res.ok) setTrial(await res.json());
      } catch {}
    };
    fetchTrial();
  }, [currentTenantId]);

  if (!trial || trial.plan !== 'trial') return null;

  const { daysRemaining, totalDays, usedPrescriptions, maxPrescriptions, isExpired } = trial.trial;
  const dayPercent = Math.round((daysRemaining / totalDays) * 100);
  const prescPercent = Math.round((usedPrescriptions / maxPrescriptions) * 100);

  if (isExpired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">⚠️</span>
          <h3 className="text-lg font-semibold text-red-800">Gói dùng thử đã hết hạn</h3>
        </div>
        <p className="text-red-700 text-sm mb-3">
          Vui lòng nâng cấp để tiếp tục sử dụng phần mềm.
        </p>
        <Link
          href="/billing"
          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition"
        >
          Nâng cấp ngay →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎁</span>
          <h3 className="text-base font-semibold text-blue-900">Gói dùng thử miễn phí</h3>
        </div>
        <Link
          href="/billing"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Xem gói nâng cấp →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Days remaining */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">📊 Trial còn</span>
            <span className="text-lg font-bold text-blue-700">{daysRemaining} ngày</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${dayPercent > 30 ? 'bg-blue-500' : dayPercent > 10 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${dayPercent}%` }}
            />
          </div>
        </div>
        {/* Prescriptions used */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">📄 Đơn đã dùng</span>
            <span className="text-lg font-bold text-indigo-700">
              {usedPrescriptions} / {maxPrescriptions}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${prescPercent < 70 ? 'bg-indigo-500' : prescPercent < 90 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(prescPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto py-6 px-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Hệ thống Quản lý Phòng khám
            </h1>
            <p className="text-xl text-gray-600">
              Quản lý bệnh nhân, thuốc và kính một cách hiệu quả
            </p>
          </div>

          <TrialBanner />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/cho-kham" className="group">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-l-4 border-red-500 group-hover:border-red-600">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">⏱️</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-red-600">
                    Chờ khám
                  </h3>
                </div>
                <p className="text-gray-600">
                  Xem danh sách bệnh nhân đang chờ khám bệnh.
                </p>
                <div className="mt-4 text-red-600 group-hover:text-red-800 font-medium">
                  Xem danh sách chờ →
                </div>
              </div>
            </Link>

            <Link href="/benh-nhan" className="group">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-l-4 border-blue-500 group-hover:border-blue-600">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">👥</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600">
                    Bệnh nhân
                  </h3>
                </div>
                <p className="text-gray-600">
                  Quản lý thông tin bệnh nhân, lịch sử khám và điều trị.
                </p>
                <div className="mt-4 text-blue-600 group-hover:text-blue-800 font-medium">
                  Quản lý bệnh nhân →
                </div>
              </div>
            </Link>

            <Link href="/thuoc" className="group">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-l-4 border-green-500 group-hover:border-green-600">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">💊</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-green-600">
                    Thuốc
                  </h3>
                </div>
                <p className="text-gray-600">
                  Quản lý kho thuốc, đơn thuốc và theo dõi tồn kho.
                </p>
                <div className="mt-4 text-green-600 group-hover:text-green-800 font-medium">
                  Quản lý thuốc →
                </div>
              </div>
            </Link>

            <Link href="/kinh" className="group">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-l-4 border-purple-500 group-hover:border-purple-600">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">👓</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-purple-600">
                    Kính
                  </h3>
                </div>
                <p className="text-gray-600">
                  Quản lý đơn kính, lưu trữ thông tin tròng và gọng kính.
                </p>
                <div className="mt-4 text-purple-600 group-hover:text-purple-800 font-medium">
                  Quản lý kính →
                </div>
              </div>
            </Link>

            <Link href="/bao-cao" className="group">
              <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-l-4 border-yellow-500 group-hover:border-yellow-600">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">📊</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-yellow-600">
                    Báo cáo
                  </h3>
                </div>
                <p className="text-gray-600">
                  Xem báo cáo doanh thu, lãi và tình hình kinh doanh theo thời gian.
                </p>
                <div className="mt-4 text-yellow-600 group-hover:text-yellow-800 font-medium">
                  Xem báo cáo →
                </div>
              </div>
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}