import React, { RefObject } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { capitalizeWords } from '@/lib/utils';
import type { BenhNhan } from '@/lib/patient/types';

export type PatientFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  form: BenhNhan;
  setForm: React.Dispatch<React.SetStateAction<BenhNhan>>;
  isSubmitting: boolean;
  onSubmit: () => void;
  /** Chỉ dùng khi isEditing — có thể bỏ qua ở chế độ thêm nhanh. */
  onDelete?: (id: number) => Promise<void>;
  confirm?: (message: string) => Promise<boolean>;
  tenRef: RefObject<HTMLInputElement | null>;
  namsinhRef: RefObject<HTMLInputElement | null>;
  dienthoaiRef: RefObject<HTMLInputElement | null>;
  diachiRef: RefObject<HTMLInputElement | null>;
  title?: string;
};

export function PatientFormDialog({
  open,
  onOpenChange,
  isEditing,
  form,
  setForm,
  isSubmitting,
  onSubmit,
  onDelete,
  confirm,
  tenRef,
  namsinhRef,
  dienthoaiRef,
  diachiRef,
  title,
}: PatientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title ?? (isEditing ? 'Sửa Bệnh Nhân' : 'Thêm Bệnh Nhân')}
          </DialogTitle>
          {isEditing && form.id && (
            <div className="text-sm text-gray-500">Mã BN: {form.mabenhnhan || '—'}</div>
          )}
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Họ Tên *</Label>
          <Input
            ref={tenRef}
            value={form.ten}
            onChange={(e) => {
              const value = e.target.value;
              const lastChar = value.slice(-1);
              if (lastChar === ' ' && value.trim()) {
                setForm({ ...form, ten: capitalizeWords(value) });
              } else {
                setForm({ ...form, ten: value });
              }
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value) {
                setForm({ ...form, ten: capitalizeWords(value) });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                namsinhRef.current?.focus();
                try { namsinhRef.current?.select?.(); } catch { /* ignore */ }
              }
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <Label>Năm sinh hoặc ngày sinh (yyyy hoặc dd/mm/yyyy) *</Label>
          <Input
            type="text"
            value={form.namsinh}
            placeholder="VD: 1980 hoặc 01/01/1980"
            ref={namsinhRef}
            onChange={(e) => setForm({ ...form, namsinh: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                dienthoaiRef.current?.focus();
                try { dienthoaiRef.current?.select?.(); } catch { /* ignore */ }
              }
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <Label>Giới tính</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={form.gioitinh || ''}
            onChange={(e) => setForm({ ...form, gioitinh: e.target.value })}
          >
            <option value="">— Chưa chọn —</option>
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>
          <Label>Điện Thoại</Label>
          <Input
            ref={dienthoaiRef}
            value={form.dienthoai}
            onChange={(e) => setForm({ ...form, dienthoai: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                diachiRef.current?.focus();
                try { diachiRef.current?.select?.(); } catch { /* ignore */ }
              }
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <Label>Địa Chỉ *</Label>
          <Input
            ref={diachiRef}
            value={form.diachi}
            onChange={(e) => {
              const value = e.target.value;
              const lastChar = value.slice(-1);
              if (lastChar === ' ' && value.trim()) {
                setForm({ ...form, diachi: capitalizeWords(value) });
              } else {
                setForm({ ...form, diachi: value });
              }
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value) {
                setForm({ ...form, diachi: capitalizeWords(value) });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                tenRef.current?.focus();
                try { tenRef.current?.select?.(); } catch { /* ignore */ }
              }
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>
        <DialogFooter className="mt-2 flex items-center gap-2">
          {isEditing && onDelete && confirm && (
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!form.id) { toast.error('Không xác định được ID bệnh nhân'); return; }
                const confirmMessage = 'Bạn chắc chắn muốn xóa bệnh nhân này?\n\n⚠ TẤT CẢ đơn thuốc, đơn kính, diễn tiến sẽ bị xóa và KHÔNG THỂ HOÀN TÁC!';
                if (!await confirm(confirmMessage)) return;
                await onDelete(form.id);
                onOpenChange(false);
              }}
              className="mr-auto"
            >
              Xóa
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting} title="Ctrl+Enter để lưu" className="bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? 'Đang lưu...' : 'Lưu (Ctrl+Enter)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
