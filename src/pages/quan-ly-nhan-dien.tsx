'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { FaceRecognitionSection } from '../components/FaceRecognitionSection';
import { FacePendingFacesPanel } from '../components/FacePendingFacesPanel';
import { FaceEnrollCamera } from '../components/FaceEnrollCamera';
import { PatientSearchInput, type PatientSearchHit } from '../components/PatientSearchInput';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Camera,
  Settings,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';

const AGENT_PREVIEW_STORAGE_KEY = 'optigo_face_agent_preview_base';
const DEFAULT_AGENT_PREVIEW = 'http://127.0.0.1:8766';

type TabId = 'pending' | 'camera' | 'setup';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

export default function QuanLyNhanDienPage() {
  const [tab, setTab] = useState<TabId>('pending');
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [enrollPatient, setEnrollPatient] = useState<PatientSearchHit | null>(null);
  const [agentPreviewBase, setAgentPreviewBase] = useState(DEFAULT_AGENT_PREVIEW);

  useEffect(() => {
    document.title = 'Nhận diện khuôn mặt — Optigo';
    const saved = localStorage.getItem(AGENT_PREVIEW_STORAGE_KEY);
    if (saved) setAgentPreviewBase(saved);
  }, []);

  useEffect(() => {
    const base = agentPreviewBase.replace(/\/$/, '');
    const check = async () => {
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) });
        setAgentOnline(res.ok);
      } catch {
        setAgentOnline(false);
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [agentPreviewBase]);

  useEffect(() => {
    axios
      .get('/api/pending-faces/stats')
      .then((res) => setPendingCount(res.data?.data?.pending || 0))
      .catch(() => {});
    const t = setInterval(() => {
      axios
        .get('/api/pending-faces/stats')
        .then((res) => setPendingCount(res.data?.data?.pending || 0))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <ProtectedRoute>
      <FeatureGate feature="face_recognition" permission="manage_clinic">
        <div className="min-h-screen bg-gray-50">
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href="/quan-ly-phong-kham"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Quản lý phòng khám
                  </Link>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Camera className="w-7 h-7 text-blue-600" />
                    Nhận diện khuôn mặt
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Khách quen tự vào chờ khám · Lễ tân xử lý khách lạ
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {agentOnline === true ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                      <Wifi className="w-3.5 h-3.5" /> Agent camera online
                    </span>
                  ) : agentOnline === false ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      <WifiOff className="w-3.5 h-3.5" /> Chưa thấy agent — chạy chay-agent.bat
                    </span>
                  ) : null}
                  {pendingCount > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-800 px-2.5 py-1 rounded-full font-medium">
                      {pendingCount} khuôn mặt chờ
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-px overflow-x-auto">
                <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Khuôn mặt chờ
                    {pendingCount > 0 && (
                      <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </span>
                </TabButton>
                <TabButton active={tab === 'camera'} onClick={() => setTab('camera')}>
                  <span className="inline-flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    Camera & đăng ký
                  </span>
                </TabButton>
                <TabButton active={tab === 'setup'} onClick={() => setTab('setup')}>
                  <span className="inline-flex items-center gap-1.5">
                    <Settings className="w-4 h-4" />
                    Cài đặt agent
                  </span>
                </TabButton>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 py-6">
            {tab === 'pending' && <FacePendingFacesPanel />}

            {tab === 'camera' && (
              <div className="space-y-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Đăng ký khuôn mặt bệnh nhân</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Chọn bệnh nhân, căn mặt vào khung oval và giữ yên khi đạt yêu cầu
                    </p>
                  </div>
                  <PatientSearchInput
                    selected={enrollPatient}
                    onSelect={setEnrollPatient}
                    placeholder="Tìm bệnh nhân cần đăng ký..."
                  />
                  {enrollPatient ? (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      Đang đăng ký cho: <strong>{enrollPatient.ten}</strong> (#
                      {enrollPatient.id})
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Chọn bệnh nhân trước khi đăng ký</p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <FaceEnrollCamera
                    patientId={enrollPatient?.id ?? null}
                    agentPreviewBase={agentPreviewBase}
                    onEnrolled={() => toast.success('Đã đăng ký — agent sẽ đồng bộ trong vài phút')}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Cần chạy <strong>chay-agent.bat</strong> trên PC camera. Preview mặc định:{' '}
                  {agentPreviewBase}
                </p>
              </div>
            )}

            {tab === 'setup' && <FaceRecognitionSection hidePendingFaces setupOnly />}
          </div>
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
