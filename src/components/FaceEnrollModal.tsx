'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Camera, CheckCircle2, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { FaceEnrollCamera } from './FaceEnrollCamera';

interface FaceEnrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName: string;
  agentPreviewBase?: string;
}

type ConsentState = 'loading' | 'granted' | 'needed' | 'migration';

export function FaceEnrollModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  agentPreviewBase = 'http://127.0.0.1:8766',
}: FaceEnrollModalProps) {
  const [hasFace, setHasFace] = useState<boolean | null>(null);
  const [consent, setConsent] = useState<ConsentState>('loading');
  const [consentChecked, setConsentChecked] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [embedHealth, setEmbedHealth] = useState<{ ok: boolean; message: string } | null>(null);

  const checkEnrollment = useCallback(async () => {
    try {
      await axios.head(`/api/face-embeddings?patient_id=${patientId}`);
      setHasFace(true);
    } catch {
      setHasFace(false);
    }
  }, [patientId]);

  const checkConsent = useCallback(async () => {
    setConsent('loading');
    try {
      const res = await axios.get(`/api/face-embeddings/consent?patient_id=${patientId}`);
      if (res.data?.needs_migration) {
        setConsent('migration');
      } else if (res.data?.consented) {
        setConsent('granted');
      } else {
        setConsent('needed');
      }
    } catch {
      // Không xác định được → yêu cầu ghi nhận đồng ý cho an toàn.
      setConsent('needed');
    }
  }, [patientId]);

  const checkEmbedHealth = useCallback(async () => {
    try {
      const res = await axios.get('/api/face-embeddings/health');
      setEmbedHealth({ ok: Boolean(res.data?.ok), message: res.data?.message || '' });
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      setEmbedHealth({
        ok: false,
        message:
          typeof msg === 'string'
            ? msg
            : 'Không kết nối dịch vụ embedding. Chạy chay-agent.bat trên PC camera.',
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      setConsentChecked(false);
      void checkEnrollment();
      void checkConsent();
      void checkEmbedHealth();
    }
  }, [open, checkEnrollment, checkConsent, checkEmbedHealth]);

  const handleEnrolled = () => {
    setHasFace(true);
  };

  const grantConsent = async () => {
    setSavingConsent(true);
    try {
      await axios.post('/api/face-embeddings/consent', { patient_id: patientId });
      toast.success('Đã ghi nhận đồng ý sinh trắc');
      setConsent('granted');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(typeof msg === 'string' ? msg : 'Không lưu được đồng ý');
    } finally {
      setSavingConsent(false);
    }
  };

  const canEnroll = (consent === 'granted' || consent === 'migration') && embedHealth?.ok !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Đăng ký khuôn mặt
          </DialogTitle>
          <DialogDescription>
            Bệnh nhân: <strong>{patientName}</strong> (#{patientId})
            {hasFace === true && (
              <span className="ml-2 inline-flex items-center gap-1 text-green-700 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã có khuôn mặt — đăng ký lại sẽ ghi đè
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {consent === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra đồng ý sinh trắc...
          </div>
        )}

        {consent === 'needed' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2 text-amber-900">
              <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Cần đồng ý sử dụng dữ liệu sinh trắc học</p>
                <p className="mt-1 text-amber-800/90 text-xs leading-relaxed">
                  Theo Nghị định 13/2023/NĐ-CP, dữ liệu khuôn mặt là dữ liệu cá nhân nhạy cảm.
                  Vui lòng xác nhận bệnh nhân đã đồng ý cho phòng khám thu thập và sử dụng dữ liệu
                  khuôn mặt để nhận diện tự động khi đến khám.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm text-amber-900">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span>Bệnh nhân <strong>{patientName}</strong> đã đồng ý.</span>
            </label>
            <Button
              type="button"
              disabled={!consentChecked || savingConsent}
              onClick={() => void grantConsent()}
            >
              {savingConsent ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" /> Đang lưu...
                </>
              ) : (
                'Xác nhận đồng ý'
              )}
            </Button>
          </div>
        )}

        {consent === 'migration' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Chưa bật quản lý đồng ý sinh trắc (migration V086). Vẫn cho phép đăng ký, nhưng nên
            chạy migration để tuân thủ quy định về dữ liệu cá nhân.
          </p>
        )}

        {embedHealth && !embedHealth.ok && (
          <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Dịch vụ embedding chưa sẵn sàng</p>
              <p className="mt-1 text-xs opacity-90">{embedHealth.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void checkEmbedHealth()}
              >
                Kiểm tra lại
              </Button>
            </div>
          </div>
        )}

        {canEnroll && (
          <FaceEnrollCamera
            key={`${patientId}-${open}`}
            patientId={patientId}
            agentPreviewBase={agentPreviewBase}
            onEnrolled={handleEnrolled}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FaceEnrollModal;
