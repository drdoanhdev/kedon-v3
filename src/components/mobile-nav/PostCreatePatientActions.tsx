import React from 'react';
import { FileText, Glasses, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { BenhNhan } from '@/lib/patient/types';

export type PostCreateAction = 'kinh' | 'thuoc' | 'stay';

export type PostCreatePatientActionsProps = {
  open: boolean;
  patient: BenhNhan | null;
  onAction: (action: PostCreateAction) => void;
  onClose: () => void;
};

export function PostCreatePatientActions({
  open,
  patient,
  onAction,
  onClose,
}: PostCreatePatientActionsProps) {
  const name = patient?.ten?.trim() || 'Khách mới';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Khách đã lưu — làm gì tiếp?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Đã thêm <span className="font-semibold text-gray-800">{name}</span>. Chọn bước tiếp theo:
        </p>
        <div className="grid gap-2 py-1">
          <Button
            type="button"
            className="h-11 justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => onAction('kinh')}
          >
            <Glasses className="w-4 h-4" />
            Kê kính
          </Button>
          <Button
            type="button"
            className="h-11 justify-start gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => onAction('thuoc')}
          >
            <FileText className="w-4 h-4" />
            Kê thuốc
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 justify-start gap-2"
            onClick={() => onAction('stay')}
          >
            <Search className="w-4 h-4" />
            Ở lại tìm kiếm
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
