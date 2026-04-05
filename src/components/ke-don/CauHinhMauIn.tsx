import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface PrintConfig {
  ten_cua_hang: string;
  dia_chi: string;
  dien_thoai: string;
  logo_url: string;
  hien_thi_logo: boolean;
  hien_thi_chan_doan: boolean;
  hien_thi_sokinh_cu: boolean;
  hien_thi_thiluc: boolean;
  hien_thi_pd: boolean;
  hien_thi_gong: boolean;
  hien_thi_trong: boolean;
  hien_thi_gia: boolean;
  hien_thi_ghi_chu: boolean;
  ghi_chu_cuoi: string;
}

const defaultConfig: PrintConfig = {
  ten_cua_hang: '',
  dia_chi: '',
  dien_thoai: '',
  logo_url: '',
  hien_thi_logo: true,
  hien_thi_chan_doan: true,
  hien_thi_sokinh_cu: true,
  hien_thi_thiluc: true,
  hien_thi_pd: true,
  hien_thi_gong: true,
  hien_thi_trong: true,
  hien_thi_gia: true,
  hien_thi_ghi_chu: true,
  ghi_chu_cuoi: '',
};

interface CauHinhMauInProps {
  config: PrintConfig;
  onConfigChange: (config: PrintConfig) => void;
}

const CauHinhMauIn: React.FC<CauHinhMauInProps> = ({ config, onConfigChange }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PrintConfig>(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleChange = (field: keyof PrintConfig, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/api/cau-hinh-mau-in', form);
      onConfigChange(form);
      setOpen(false);
    } catch (err) {
      console.error('Lỗi lưu cấu hình mẫu in:', err);
      alert('Không lưu được cấu hình. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const toggleFields: { key: keyof PrintConfig; label: string }[] = [
    { key: 'hien_thi_logo', label: 'Hiển thị logo' },
    { key: 'hien_thi_chan_doan', label: 'Chẩn đoán' },
    { key: 'hien_thi_thiluc', label: 'Thị lực' },
    { key: 'hien_thi_sokinh_cu', label: 'Số kính cũ' },
    { key: 'hien_thi_pd', label: 'PD/2' },
    { key: 'hien_thi_gong', label: 'Gọng' },
    { key: 'hien_thi_trong', label: 'Tròng' },
    { key: 'hien_thi_gia', label: 'Giá' },
    { key: 'hien_thi_ghi_chu', label: 'Ghi chú' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="bg-white border border-gray-300 text-gray-500 p-2.5 rounded-xl hover:bg-gray-50 touch-manipulation"
          title="Cài đặt mẫu in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cài đặt mẫu in</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Store info */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase">Thông tin cửa hàng</Label>
            <div>
              <Label className="text-sm">Tên cửa hàng</Label>
              <Input
                value={form.ten_cua_hang}
                onChange={e => handleChange('ten_cua_hang', e.target.value)}
                placeholder="VD: Mắt kính ABC"
              />
            </div>
            <div>
              <Label className="text-sm">Địa chỉ</Label>
              <Input
                value={form.dia_chi}
                onChange={e => handleChange('dia_chi', e.target.value)}
                placeholder="VD: 123 Nguyễn Huệ, Q1, TP.HCM"
              />
            </div>
            <div>
              <Label className="text-sm">Điện thoại</Label>
              <Input
                value={form.dien_thoai}
                onChange={e => handleChange('dien_thoai', e.target.value)}
                placeholder="VD: 0901234567"
              />
            </div>
            <div>
              <Label className="text-sm">URL Logo</Label>
              <Input
                value={form.logo_url}
                onChange={e => handleChange('logo_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Toggle fields */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase">Hiển thị trên phiếu in</Label>
            <div className="grid grid-cols-2 gap-2">
              {toggleFields.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={e => handleChange(key, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="space-y-1">
            <Label className="text-sm">Ghi chú cuối phiếu</Label>
            <Textarea
              value={form.ghi_chu_cuoi}
              onChange={e => handleChange('ghi_chu_cuoi', e.target.value)}
              placeholder="VD: Cảm ơn quý khách đã tin tưởng sử dụng dịch vụ!"
              rows={2}
            />
          </div>

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { defaultConfig };
export type { PrintConfig };
export default CauHinhMauIn;
