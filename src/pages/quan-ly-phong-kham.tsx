/**
 * Trang quản lý phòng khám (Chủ phòng khám / Admin)
 * - Xem/sửa thông tin phòng khám
 * - Quản lý thành viên: thêm/sửa role/xóa
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { Badge } from '../components/ui/badge';
import { FeatureGate } from '../components/FeatureGate';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { fetchWithAuth, getAuthHeaders } from '../lib/fetchWithAuth';
import { QuanLyChuoiSection } from './quan-ly-chuoi';
import { QuanLyVaiTroSection } from './quan-ly-vai-tro';
import { CauHinhInSection } from './cau-hinh-in';
import { CaiDatNhanTinSection } from './cai-dat-nhan-tin';
import LoginSecurityCard from '../components/LoginSecurityCard';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ phòng khám',
  admin: 'Quản trị viên',
  doctor: 'Bác sĩ',
  staff: 'Nhân viên',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  doctor: 'bg-green-100 text-green-800',
  staff: 'bg-gray-100 text-gray-800',
};

interface TenantInfo {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  settings?: any;
}

export default function QuanLyPhongKham() {
  const router = useRouter();
  const { currentTenant, currentRole, user, currentTenantId, tenancyLoading } = useAuth();
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [planInfo, setPlanInfo] = useState<any>(null);

  // Form state
  const [editTenant, setEditTenant] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [activeSection, setActiveSection] = useState<'info' | 'members' | 'plan' | 'branches' | 'chain' | 'roles' | 'print' | 'messaging' | 'tax' | 'face'>('info');

  // VAT config state
  const [vatConfig, setVatConfig] = useState({ ap_dung_vat: false, thue_suat: 8, gia_da_bao_gom_vat: true, ma_so_thue: '', ten_don_vi: '', dia_chi_don_vi: '' });
  const [vatSaving, setVatSaving] = useState(false);

  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin';

  useEffect(() => {
    if (tenancyLoading || !isOwnerOrAdmin) return;
    // Fetch plan info
    if (currentTenantId) {
      (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch('/api/tenants/trial', { headers });
          if (res.ok) setPlanInfo(await res.json());
        } catch {}
      })();
    }
    if (currentTenant) {
      setTenantInfo({
        id: currentTenant.id,
        name: currentTenant.name || '',
        code: currentTenant.code || null,
        phone: null,
        address: null,
        settings: {},
      });
      setTenantName(currentTenant.name || '');
      setTenantCode(currentTenant.code || '');
    }
  }, [currentTenant, currentTenantId, isOwnerOrAdmin, tenancyLoading]);

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/tenants');
        const data = await res.json();
        const rows = data?.data || [];
        const t = rows.find((x: any) => x.id === currentTenantId);
        if (!t) return;

        const settings = t.settings || {};

        setTenantInfo({
          id: t.id,
          name: t.name || '',
          code: t.code || null,
          phone: t.phone || null,
          address: t.address || null,
          settings,
        });
        setTenantName(t.name || '');
        setTenantCode(t.code || '');
        setTenantPhone(t.phone || '');
        setTenantAddress(t.address || '');
        // Load VAT config from settings
        if (settings?.vat) {
          setVatConfig(prev => ({ ...prev, ...settings.vat }));
        }
      } catch {}
    })();
  }, [currentTenantId]);

  const handleUpdateTenant = async () => {
    if (!tenantInfo) return;
    try {
      const res = await fetchWithAuth('/api/tenants', {
        method: 'PUT',
        body: JSON.stringify({
          id: tenantInfo.id,
          name: tenantName,
          code: tenantCode,
          phone: tenantPhone,
          address: tenantAddress,
          settings: tenantInfo.settings || {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Đã cập nhật thông tin phòng khám');
        setEditTenant(false);
      } else {
        toast.error(data.message || 'Lỗi cập nhật');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  // ========================================================================
  // Section: Thông tin phòng khám
  // ========================================================================
  const infoSection = (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <span className="text-base">🏥</span>
          <h3 className="text-sm font-semibold text-gray-800">Thông tin phòng khám</h3>
          <div className="ml-auto">
            {!editTenant ? (
              <button
                onClick={() => setEditTenant(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Chỉnh sửa
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateTenant}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Lưu
                </button>
                <button
                  onClick={() => setEditTenant(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Hủy
                </button>
              </div>
            )}
          </div>
        </div>

        {editTenant ? (
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Tên phòng khám</label>
                <input
                  value={tenantName}
                  onChange={e => setTenantName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="Tên phòng khám"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Mã phòng khám</label>
                <input
                  value={tenantCode}
                  onChange={e => setTenantCode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="VD: PK001"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Số điện thoại</label>
                <input
                  value={tenantPhone}
                  onChange={e => setTenantPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="0912 345 678"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Địa chỉ</label>
                <input
                  value={tenantAddress}
                  onChange={e => setTenantAddress(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="Địa chỉ phòng khám"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {[
              { label: 'Tên phòng khám', value: currentTenant?.name },
              { label: 'Mã phòng khám', value: currentTenant?.code },
              { label: 'Số điện thoại', value: tenantInfo?.phone },
              { label: 'Địa chỉ', value: tenantInfo?.address },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3 flex items-center justify-between gap-4">
                <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
                <span className="text-sm font-medium text-gray-900 text-right">{value || '—'}</span>
              </div>
            ))}
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500 w-40 shrink-0">Trạng thái</span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">Hoạt động</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ========================================================================
  // Section: Gói dịch vụ
  // ========================================================================
  const PLAN_META: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    enterprise: { icon: '🏪', label: 'Doanh nghiệp', color: 'text-amber-700', bg: 'bg-amber-100' },
    pro:        { icon: '💎', label: 'Chuyên nghiệp', color: 'text-purple-700', bg: 'bg-purple-100' },
    basic:      { icon: '🔵', label: 'Cơ bản', color: 'text-blue-700', bg: 'bg-blue-100' },
    trial:      { icon: '🎁', label: 'Dùng thử', color: 'text-gray-700', bg: 'bg-gray-100' },
  };
  const planSection = (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <span className="text-base">💳</span>
          <h3 className="text-sm font-semibold text-gray-800">Gói dịch vụ</h3>
          {planInfo && (() => {
            const meta = PLAN_META[planInfo.plan] || PLAN_META.trial;
            return (
              <span className={`ml-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${meta.bg} ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
            );
          })()}
        </div>

        {!planInfo ? (
          <div className="px-5 py-4 text-sm text-gray-400">Đang tải thông tin gói...</div>
        ) : (
          <div className="divide-y">
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500 w-44 shrink-0">Gói hiện tại</span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${(PLAN_META[planInfo.plan] || PLAN_META.trial).bg} ${(PLAN_META[planInfo.plan] || PLAN_META.trial).color}`}>
                {(PLAN_META[planInfo.plan] || PLAN_META.trial).icon} {(PLAN_META[planInfo.plan] || PLAN_META.trial).label}
              </span>
            </div>

            {planInfo.plan === 'trial' && planInfo.trial && (
              <>
                <div className="px-5 py-3 flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500 w-44 shrink-0">Ngày còn lại</span>
                  <span className={`text-sm font-semibold ${planInfo.trial.daysRemaining <= 7 ? 'text-red-600' : planInfo.trial.daysRemaining <= 30 ? 'text-amber-600' : 'text-green-600'}`}>
                    {planInfo.trial.daysRemaining} / {planInfo.trial.totalDays} ngày
                  </span>
                </div>
                <div className="px-5 py-3 flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500 w-44 shrink-0">Đơn đã dùng</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {planInfo.trial.usedPrescriptions} / {planInfo.trial.maxPrescriptions}
                  </span>
                </div>
                {planInfo.trial.isExpired && (
                  <div className="px-5 py-3">
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                      ⚠️ Gói dùng thử đã hết hạn!
                    </span>
                  </div>
                )}
              </>
            )}

            {planInfo.plan !== 'trial' && planInfo.planExpiresAt && (
              <div className="px-5 py-3 flex items-center justify-between gap-4">
                <span className="text-xs text-gray-500 w-44 shrink-0">Hạn sử dụng</span>
                <span className={`text-sm font-semibold ${new Date(planInfo.planExpiresAt) < new Date() ? 'text-red-600' : 'text-green-600'}`}>
                  {new Date(planInfo.planExpiresAt).toLocaleDateString('vi-VN')}
                  {new Date(planInfo.planExpiresAt) < new Date() && ' (Đã hết hạn)'}
                </span>
              </div>
            )}

            <div className="px-5 py-4">
              <Link
                href="/billing"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {planInfo.plan === 'trial' || (planInfo.planExpiresAt && new Date(planInfo.planExpiresAt) < new Date())
                  ? '🚀 Nâng cấp gói'
                  : '💳 Quản lý gói dịch vụ'}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ========================================================================
  // Section: Khai thuế & hóa đơn
  // ========================================================================
  const handleSaveVat = async () => {
    if (!tenantInfo) return;
    setVatSaving(true);
    try {
      const newSettings = { ...(tenantInfo.settings || {}), vat: vatConfig };
      const res = await fetchWithAuth('/api/tenants', {
        method: 'PUT',
        body: JSON.stringify({ id: tenantInfo.id, name: tenantName, code: tenantCode, phone: tenantPhone, address: tenantAddress, settings: newSettings }),
      });
      if (res.ok) {
        setTenantInfo(prev => prev ? { ...prev, settings: newSettings } : prev);
        toast.success('Đã lưu cài đặt thuế');
      } else {
        const d = await res.json();
        toast.error(d.message || 'Lỗi lưu cài đặt');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
    setVatSaving(false);
  };

  const taxSection = (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <span className="text-base">🧾</span>
          <h3 className="text-sm font-semibold text-gray-800">Cài đặt thuế GTGT</h3>
        </div>
        <div className="p-5 space-y-5">
          {/* Toggle VAT */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Áp dụng thuế GTGT</p>
              <p className="text-xs text-gray-500 mt-0.5">Hiển thị cột thuế trong báo cáo & xuất Excel</p>
            </div>
            <button
              type="button"
              onClick={() => setVatConfig(v => ({ ...v, ap_dung_vat: !v.ap_dung_vat }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vatConfig.ap_dung_vat ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${vatConfig.ap_dung_vat ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {vatConfig.ap_dung_vat && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {/* Thuế suất */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Thuế suất mặc định</label>
                <div className="flex gap-2">
                  {[0, 5, 8, 10].map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setVatConfig(v => ({ ...v, thue_suat: rate }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${vatConfig.thue_suat === rate ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:border-blue-400'}`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Cách tính giá */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cách ghi nhận giá bán</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="gia_vat" checked={vatConfig.gia_da_bao_gom_vat} onChange={() => setVatConfig(v => ({ ...v, gia_da_bao_gom_vat: true }))} className="text-blue-600" />
                    <span className="text-sm text-gray-700">Giá bán <strong>đã bao gồm</strong> VAT — tiền hàng = giá / (1 + thuế suất)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="gia_vat" checked={!vatConfig.gia_da_bao_gom_vat} onChange={() => setVatConfig(v => ({ ...v, gia_da_bao_gom_vat: false }))} className="text-blue-600" />
                    <span className="text-sm text-gray-700">Giá bán <strong>chưa bao gồm</strong> VAT — tiền thuế = giá × thuế suất</span>
                  </label>
                </div>
              </div>

              {/* Ví dụ tính */}
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                {(() => {
                  const vd = 1000000;
                  const ts = vatConfig.thue_suat / 100;
                  const tienHang = vatConfig.gia_da_bao_gom_vat ? Math.round(vd / (1 + ts)) : vd;
                  const tienThue = vatConfig.gia_da_bao_gom_vat ? vd - tienHang : Math.round(vd * ts);
                  return (
                    <>
                      <p className="font-medium mb-1">Ví dụ: Đơn kính 1.000.000đ với thuế {vatConfig.thue_suat}%</p>
                      <p>→ Tiền hàng: {tienHang.toLocaleString('vi-VN')}đ | Tiền thuế: {tienThue.toLocaleString('vi-VN')}đ | Tổng: {(tienHang + tienThue).toLocaleString('vi-VN')}đ</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Thông tin doanh nghiệp cho hóa đơn */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <span className="text-base">🏢</span>
          <h3 className="text-sm font-semibold text-gray-800">Thông tin xuất hóa đơn</h3>
          <span className="ml-auto text-xs text-gray-400">Dùng khi xuất Excel / hóa đơn</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mã số thuế</label>
              <input
                type="text"
                value={vatConfig.ma_so_thue}
                onChange={e => setVatConfig(v => ({ ...v, ma_so_thue: e.target.value }))}
                placeholder="VD: 0123456789"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên đơn vị</label>
              <input
                type="text"
                value={vatConfig.ten_don_vi}
                onChange={e => setVatConfig(v => ({ ...v, ten_don_vi: e.target.value }))}
                placeholder="VD: Cửa hàng Kính ABC"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Địa chỉ</label>
            <input
              type="text"
              value={vatConfig.dia_chi_don_vi}
              onChange={e => setVatConfig(v => ({ ...v, dia_chi_don_vi: e.target.value }))}
              placeholder="VD: 123 Nguyễn Huệ, Q.1, TP.HCM"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <p className="text-xs text-gray-400">Thông tin này sẽ xuất hiện trong file Excel báo cáo doanh thu.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSaveVat}
          disabled={vatSaving}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {vatSaving ? 'Đang lưu...' : 'Lưu cài đặt thuế'}
        </button>
      </div>
    </div>
  );

  // ========================================================================
  // Section: Tài khoản người dùng
  // ========================================================================
  const membersSection = <LoginSecurityCard />;

  // ========================================================================
  // Sidebar (KiotViet-style settings layout)
  // ========================================================================
  type Section = {
    id: 'info' | 'members' | 'plan' | 'branches' | 'chain' | 'roles' | 'print' | 'messaging' | 'tax' | 'face';
    label: string;
    icon: string;
    group: string;
  };
  const sections: Section[] = [
    { id: 'info', label: 'Thông tin phòng khám', icon: '🏥', group: 'Phòng khám' },
    { id: 'members', label: 'Tài khoản người dùng', icon: '👥', group: 'Phòng khám' },
    { id: 'plan', label: 'Gói dịch vụ', icon: '💳', group: 'Phòng khám' },
  ];
  if (currentTenant?.plan === 'enterprise') {
    sections.push(
      { id: 'branches', label: 'Quản lý chi nhánh', icon: '📍', group: 'Chuỗi cửa hàng' },
      { id: 'chain',    label: 'Phân công nhân viên', icon: '🧑‍💼', group: 'Chuỗi cửa hàng' },
    );
  }
  sections.push(
    { id: 'roles',     label: 'Quản lý vai trò & quyền',  icon: '🛡️', group: 'Cấu hình' },
    { id: 'print',     label: 'Cấu hình mẫu in',          icon: '🖨️', group: 'Cấu hình' },
    { id: 'messaging', label: 'Cài đặt nhắn tin tự động', icon: '💬', group: 'Cấu hình' },
    { id: 'face',      label: 'Nhận diện khuôn mặt',      icon: '📷', group: 'Cấu hình' },
    { id: 'tax',       label: 'Khai thuế & hóa đơn',      icon: '🧾', group: 'Tài chính' },
  );

  // Map: id -> content
  const sectionContent: Record<string, React.ReactNode> = {
    info: infoSection,
    members: membersSection,
    plan: planSection,
    branches: (
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <QuanLyChuoiSection embedded initialTab="branches" />
      </FeatureGate>
    ),
    chain: (
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <QuanLyChuoiSection embedded initialTab="staff" />
      </FeatureGate>
    ),
    roles:     <QuanLyVaiTroSection />,
    print:     <CauHinhInSection />,
    messaging: <CaiDatNhanTinSection />,
    face: (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-lg">
        <h3 className="text-lg font-semibold">Nhận diện khuôn mặt</h3>
        <p className="text-sm text-gray-600">
          Quản lý agent, camera, đăng ký BN và xử lý khuôn mặt chờ trên trang riêng — giao diện rộng hơn,
          phù hợp lễ tân làm việc hàng ngày.
        </p>
        <Link
          href="/quan-ly-nhan-dien"
          className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
        >
          Mở trang nhận diện →
        </Link>
      </div>
    ),
    tax: taxSection,
  };

  // Group sections by `group`
  const groupedSections = sections.reduce<Record<string, Section[]>>((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  const sidebar = (
    <aside className="w-full md:w-64 shrink-0">
      <div className="bg-white rounded-xl border border-gray-200 sticky top-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold">Thiết lập</h2>
        </div>
        <nav className="py-2">
          {Object.entries(groupedSections).map(([groupName, items]) => (
            <div key={groupName} className="mb-2">
              <p className="px-4 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{groupName}</p>
              {items.map(s => {
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id === 'face') {
                        router.push('/quan-ly-nhan-dien');
                        return;
                      }
                      setActiveSection(s.id as typeof activeSection);
                    }}
                    className={`w-full text-left flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );

  const pageContent = tenancyLoading ? (
    <div className="bg-white rounded-xl p-8 text-center text-gray-500">Đang tải thông tin phòng khám...</div>
  ) : !isOwnerOrAdmin ? (
    <div className="min-h-[40vh] flex items-center justify-center bg-gray-50 rounded-xl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Không có quyền truy cập</h1>
        <p className="text-gray-600">Chỉ chủ phòng khám hoặc quản trị viên mới có quyền quản lý.</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 block">Quay lại trang chủ</Link>
      </div>
    </div>
  ) : (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Quản lý Phòng khám</h1>
        <Badge className={ROLE_COLORS[currentRole || 'staff']}>
          {ROLE_LABELS[currentRole || 'staff']}
        </Badge>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {sidebar}
        <main className="flex-1 min-w-0 space-y-4">
          {sectionContent[activeSection] || sectionContent.info}
        </main>
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="max-w-7xl mx-auto p-4">{pageContent}</div>
    </ProtectedRoute>
  );
}
