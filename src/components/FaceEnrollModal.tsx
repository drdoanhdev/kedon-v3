'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Camera, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { FaceEnrollCamera } from './FaceEnrollCamera';

interface FaceEnrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName: string;
  agentPreviewBase?: string;
}

export function FaceEnrollModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  agentPreviewBase = 'http://127.0.0.1:8766',
}: FaceEnrollModalProps) {
  const [hasFace, setHasFace] = useState<boolean | null>(null);

  const checkEnrollment = useCallback(async () => {
    try {
      await axios.head(`/api/face-embeddings?patient_id=${patientId}`);
      setHasFace(true);
    } catch {
      setHasFace(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) void checkEnrollment();
  }, [open, checkEnrollment]);

  const handleEnrolled = () => {
    setHasFace(true);
  };

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

        <FaceEnrollCamera
          key={`${patientId}-${open}`}
          patientId={patientId}
          agentPreviewBase={agentPreviewBase}
          onEnrolled={handleEnrolled}
        />
      </DialogContent>
    </Dialog>
  );
}

export default FaceEnrollModal;
