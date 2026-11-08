import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { BenhNhan } from '@/lib/patient/types';

export type MergePatientsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: BenhNhan[];
  selectedForMerge: number[];
  mainPatientId: number | null;
  setMainPatientId: (id: number | null) => void;
  onConfirm: () => void;
};

export function MergePatientsDialog({
  open,
  onOpenChange,
  patients,
  selectedForMerge,
  mainPatientId,
  setMainPatientId,
  onConfirm,
}: MergePatientsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn bệnh nhân chính để giữ lại</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600 mb-4">
            Chọn bệnh nhân muốn giữ lại. Tất cả đơn thuốc của các bệnh nhân khác sẽ được chuyển cho bệnh nhân này.
          </p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {patients
              .filter((bn) => selectedForMerge.includes(bn.id!))
              .map((bn) => (
                <div
                  key={bn.id}
                  className={`border rounded p-3 cursor-pointer transition-colors ${
                    mainPatientId === bn.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setMainPatientId(bn.id!)}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="mainPatient"
                      checked={mainPatientId === bn.id}
                      onChange={() => setMainPatientId(bn.id!)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {bn.ten} (ID: {bn.id})
                      </div>
                      <div className="text-sm text-gray-600">
                        Mã BN: {bn.mabenhnhan || '—'} • Năm sinh: {bn.namsinh}
                        {bn.gioitinh ? ` • ${bn.gioitinh}` : ''} • SĐT: {bn.dienthoai || 'Chưa có'}
                      </div>
                      <div className="text-sm text-gray-500">
                        Địa chỉ: {bn.diachi}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setMainPatientId(null);
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!mainPatientId}
            className="bg-green-600 hover:bg-green-700"
          >
            Gộp bệnh nhân
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
