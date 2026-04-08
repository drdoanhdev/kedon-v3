'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import toast from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';
import { Printer } from 'lucide-react';

interface PrintConfig {
  ten_cua_hang: string;
  dia_chi: string;
  dien_thoai: string;
  logo_url: string;
  // Đơn kính
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
  // Đơn thuốc
  hien_thi_logo_thuoc: boolean;
  hien_thi_chan_doan_thuoc: boolean;
  hien_thi_gia_thuoc: boolean;
  hien_thi_ghi_chu_thuoc: boolean;
  ghi_chu_cuoi_thuoc: string;
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
  hien_thi_logo_thuoc: true,
  hien_thi_chan_doan_thuoc: true,
  hien_thi_gia_thuoc: false,
  hien_thi_ghi_chu_thuoc: true,
  ghi_chu_cuoi_thuoc: '',
};

export default function CauHinhIn() {
  const [form, setForm] = useState<PrintConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Cấu hình in';
  }, []);

  useEffect(() => {
    axios.get('/api/cau-hinh-mau-in')
      .then(res => {
        if (res.data?.data) setForm(res.data.data);
        else if (res.data) setForm(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof PrintConfig, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/cau-hinh-mau-in', form);
      toast.success('Đã lưu cấu hình in');
    } catch (err) {
      console.error('Lỗi lưu cấu hình mẫu in:', err);
      toast.error('Không lưu được cấu hình. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const kinhToggleFields: { key: keyof PrintConfig; label: string }[] = [
    { key: 'hien_thi_chan_doan', label: 'Chẩn đoán' },
    { key: 'hien_thi_thiluc', label: 'Thị lực' },
    { key: 'hien_thi_sokinh_cu', label: 'Số kính cũ' },
    { key: 'hien_thi_pd', label: 'PD/2' },
    { key: 'hien_thi_gong', label: 'Gọng' },
    { key: 'hien_thi_trong', label: 'Tròng' },
    { key: 'hien_thi_gia', label: 'Giá' },
    { key: 'hien_thi_ghi_chu', label: 'Ghi chú' },
  ];

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex items-center justify-center h-[calc(100vh-72px)]">
          <p className="text-gray-400 text-sm">Đang tải...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6" style={{ minHeight: 'calc(100vh - 72px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Printer className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Cấu hình in</h1>
            <p className="text-xs text-gray-500">Cài đặt thông tin hiển thị trên phiếu in đơn kính và đơn thuốc</p>
          </div>
        </div>

        {/* Thông tin cửa hàng */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Thông tin cửa hàng / phòng khám</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Tên cửa hàng</Label>
              <Input
                value={form.ten_cua_hang}
                onChange={e => handleChange('ten_cua_hang', e.target.value)}
                placeholder="VD: Mắt kính ABC"
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
            <Label className="text-sm">URL Logo</Label>
            <Input
              value={form.logo_url}
              onChange={e => handleChange('logo_url', e.target.value)}
              placeholder="https://..."
            />
            {form.logo_url && (
              <div className="mt-2 flex items-center gap-2">
                <img src={form.logo_url} alt="Logo preview" className="max-h-12 max-w-[160px] rounded border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className="text-xs text-gray-400">Xem trước</span>
              </div>
            )}
          </div>
        </div>

        {/* Hiển thị trên phiếu in đơn kính */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">👓</span>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Phiếu in đơn kính</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hien_thi_logo as boolean} onChange={e => handleChange('hien_thi_logo', e.target.checked)} className="rounded border-gray-300" />
              Hiển thị logo
            </label>
            {kinhToggleFields.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form[key] as boolean} onChange={e => handleChange(key, e.target.checked)} className="rounded border-gray-300" />
                {label}
              </label>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-100">
            <Label className="text-sm">Ghi chú cuối phiếu đơn kính</Label>
            <Textarea
              value={form.ghi_chu_cuoi}
              onChange={e => handleChange('ghi_chu_cuoi', e.target.value)}
              placeholder="VD: Cảm ơn quý khách đã tin tưởng sử dụng dịch vụ!"
              rows={2}
            />
          </div>
        </div>

        {/* Hiển thị trên phiếu in đơn thuốc */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">💊</span>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Phiếu in đơn thuốc</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hien_thi_logo_thuoc as boolean} onChange={e => handleChange('hien_thi_logo_thuoc', e.target.checked)} className="rounded border-gray-300" />
              Hiển thị logo
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hien_thi_chan_doan_thuoc as boolean} onChange={e => handleChange('hien_thi_chan_doan_thuoc', e.target.checked)} className="rounded border-gray-300" />
              Chẩn đoán
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hien_thi_gia_thuoc as boolean} onChange={e => handleChange('hien_thi_gia_thuoc', e.target.checked)} className="rounded border-gray-300" />
              Giá
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hien_thi_ghi_chu_thuoc as boolean} onChange={e => handleChange('hien_thi_ghi_chu_thuoc', e.target.checked)} className="rounded border-gray-300" />
              Ghi chú
            </label>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <Label className="text-sm">Ghi chú cuối phiếu đơn thuốc</Label>
            <Textarea
              value={form.ghi_chu_cuoi_thuoc}
              onChange={e => handleChange('ghi_chu_cuoi_thuoc', e.target.value)}
              placeholder="VD: Tái khám sau 1 tuần nếu không đỡ."
              rows={2}
            />
          </div>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto bg-blue-600 text-white font-semibold text-sm py-3 px-8 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>
    </ProtectedRoute>
  );
}
