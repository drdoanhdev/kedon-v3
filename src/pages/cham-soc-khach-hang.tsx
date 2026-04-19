import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { useAuth } from '../contexts/AuthContext';
import { HeartHandshake, Phone, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../lib/fetchWithAuth';

type CareStatus = 'chua_lien_he' | 'da_goi' | 'hen_goi_lai' | 'da_chot_lich';
type PriorityTier = 'A' | 'B' | 'C';

interface CrmCustomer {
  id: number;
  ten: string;
  dienthoai?: string;
  ngay_kham_cuoi?: string;
  so_ngay: number;
  gia_tri_don_gan_nhat: number;
  tong_gia_tri_dich_vu: number;
  so_lan_su_dung_dich_vu: number;
  so_hen_qua_han: number;
  uu_tien: number;
  muc_uu_tien: PriorityTier;
  care_status: CareStatus;
  next_call_at?: string | null;
}

interface ApiResponse {
  items: CrmCustomer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: {
    priority: { A: number; B: number; C: number };
    careStatus: { chua_lien_he: number; da_goi: number; hen_goi_lai: number; da_chot_lich: number };
  };
  scoringConfig: {
    daysThreshold: number;
  };
}

interface TenantRow {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  settings?: any;
}

type CrmSettingsForm = {
  daysThreshold: string;
  limit: string;
  priorityAThreshold: string;
  priorityBThreshold: string;
  valuePerPoint: string;
  valueBonusCap: string;
  lifetimeValuePerPoint: string;
  lifetimeValueBonusCap: string;
  serviceCountPoint: string;
  serviceCountBonusCap: string;
  overduePoint: string;
  overdueBonusCap: string;
  onlyHasPhone: boolean;
  prioritizeHighValue: boolean;
};

const CRM_DEFAULTS: CrmSettingsForm = {
  daysThreshold: '90',
  limit: '20',
  priorityAThreshold: '140',
  priorityBThreshold: '105',
  valuePerPoint: '200000',
  valueBonusCap: '50',
  lifetimeValuePerPoint: '1500000',
  lifetimeValueBonusCap: '35',
  serviceCountPoint: '3',
  serviceCountBonusCap: '25',
  overduePoint: '15',
  overdueBonusCap: '40',
  onlyHasPhone: false,
  prioritizeHighValue: true,
};

const CRM_PRESETS: Record<'small' | 'medium' | 'large', CrmSettingsForm> = {
  small: {
    daysThreshold: '120',
    limit: '20',
    priorityAThreshold: '155',
    priorityBThreshold: '120',
    valuePerPoint: '250000',
    valueBonusCap: '40',
    lifetimeValuePerPoint: '2000000',
    lifetimeValueBonusCap: '28',
    serviceCountPoint: '2',
    serviceCountBonusCap: '20',
    overduePoint: '18',
    overdueBonusCap: '35',
    onlyHasPhone: true,
    prioritizeHighValue: true,
  },
  medium: {
    daysThreshold: '90',
    limit: '35',
    priorityAThreshold: '140',
    priorityBThreshold: '105',
    valuePerPoint: '200000',
    valueBonusCap: '50',
    lifetimeValuePerPoint: '1500000',
    lifetimeValueBonusCap: '35',
    serviceCountPoint: '3',
    serviceCountBonusCap: '25',
    overduePoint: '15',
    overdueBonusCap: '40',
    onlyHasPhone: true,
    prioritizeHighValue: true,
  },
  large: {
    daysThreshold: '75',
    limit: '60',
    priorityAThreshold: '125',
    priorityBThreshold: '95',
    valuePerPoint: '150000',
    valueBonusCap: '70',
    lifetimeValuePerPoint: '1200000',
    lifetimeValueBonusCap: '45',
    serviceCountPoint: '4',
    serviceCountBonusCap: '35',
    overduePoint: '12',
    overdueBonusCap: '50',
    onlyHasPhone: true,
    prioritizeHighValue: true,
  },
};

function money(n?: number): string {
  return `${(n || 0).toLocaleString('vi-VN')}đ`;
}

function careStatusLabel(status: CareStatus) {
  if (status === 'da_goi') return { text: 'Đã gọi', cls: 'bg-blue-100 text-blue-700' };
  if (status === 'hen_goi_lai') return { text: 'Hẹn gọi lại', cls: 'bg-amber-100 text-amber-700' };
  if (status === 'da_chot_lich') return { text: 'Đã chốt lịch', cls: 'bg-green-100 text-green-700' };
  return { text: 'Chưa liên hệ', cls: 'bg-gray-100 text-gray-700' };
}

function priorityLabel(tier: PriorityTier) {
  if (tier === 'A') return { text: 'Cấp A', cls: 'bg-red-100 text-red-700' };
  if (tier === 'B') return { text: 'Cấp B', cls: 'bg-orange-100 text-orange-700' };
  return { text: 'Cấp C', cls: 'bg-teal-100 text-teal-700' };
}

export default function ChamSocKhachHangPage() {
  const { currentTenantId, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [crmSettings, setCrmSettings] = useState<CrmSettingsForm>(CRM_DEFAULTS);
  const [tenantRow, setTenantRow] = useState<TenantRow | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [search, setSearch] = useState('');
  const [careStatus, setCareStatus] = useState<'all' | CareStatus>('all');
  const [priority, setPriority] = useState<'all' | PriorityTier>('all');
  const [onlyHasPhone, setOnlyHasPhone] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin';

  const applyCrmConfig = (cfg: CrmSettingsForm) => {
    setCrmSettings(cfg);
    setOnlyHasPhone(cfg.onlyHasPhone);
  };

  const handleApplyPreset = (size: 'small' | 'medium' | 'large') => {
    applyCrmConfig(CRM_PRESETS[size]);
    const label = size === 'small' ? 'Nhỏ' : size === 'medium' ? 'Vừa' : 'Lớn';
    toast.success(`Đã áp dụng preset cửa hàng ${label}. Bấm Lưu cấu hình CRM để ghi nhận.`);
  };

  const handleResetCrmDefaults = () => {
    applyCrmConfig(CRM_DEFAULTS);
    toast.success('Đã khôi phục cấu hình mặc định. Bấm Lưu cấu hình CRM để ghi nhận.');
  };

  const loadCrmSettings = async () => {
    if (!currentTenantId) return;
    setSettingsLoading(true);
    try {
      const res = await fetchWithAuth('/api/tenants');
      const payload = await res.json();
      const rows = payload?.data || [];
      const t = rows.find((x: any) => x.id === currentTenantId);
      if (!t) return;

      setTenantRow(t);
      const cfg = t?.settings?.dashboard?.crm || {};
      const next: CrmSettingsForm = {
        daysThreshold: String(Number.isFinite(Number(cfg.daysThreshold)) ? Number(cfg.daysThreshold) : 90),
        limit: String(Number.isFinite(Number(cfg.limit)) ? Number(cfg.limit) : 20),
        priorityAThreshold: String(Number.isFinite(Number(cfg.priorityAThreshold)) ? Number(cfg.priorityAThreshold) : 140),
        priorityBThreshold: String(Number.isFinite(Number(cfg.priorityBThreshold)) ? Number(cfg.priorityBThreshold) : 105),
        valuePerPoint: String(Number.isFinite(Number(cfg.valuePerPoint)) ? Number(cfg.valuePerPoint) : 200000),
        valueBonusCap: String(Number.isFinite(Number(cfg.valueBonusCap)) ? Number(cfg.valueBonusCap) : 50),
        lifetimeValuePerPoint: String(Number.isFinite(Number(cfg.lifetimeValuePerPoint)) ? Number(cfg.lifetimeValuePerPoint) : 1500000),
        lifetimeValueBonusCap: String(Number.isFinite(Number(cfg.lifetimeValueBonusCap)) ? Number(cfg.lifetimeValueBonusCap) : 35),
        serviceCountPoint: String(Number.isFinite(Number(cfg.serviceCountPoint)) ? Number(cfg.serviceCountPoint) : 3),
        serviceCountBonusCap: String(Number.isFinite(Number(cfg.serviceCountBonusCap)) ? Number(cfg.serviceCountBonusCap) : 25),
        overduePoint: String(Number.isFinite(Number(cfg.overduePoint)) ? Number(cfg.overduePoint) : 15),
        overdueBonusCap: String(Number.isFinite(Number(cfg.overdueBonusCap)) ? Number(cfg.overdueBonusCap) : 40),
        onlyHasPhone: cfg.onlyHasPhone === true,
        prioritizeHighValue: cfg.prioritizeHighValue !== false,
      };
      setCrmSettings(next);
      setOnlyHasPhone(next.onlyHasPhone);
    } catch {
      toast.error('Không tải được cấu hình CRM');
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveCrmSettings = async () => {
    if (!tenantRow) {
      toast.error('Không tìm thấy thông tin phòng khám để lưu cấu hình');
      return;
    }

    setSettingsSaving(true);
    try {
      const nextDays = Math.min(Math.max(parseInt(crmSettings.daysThreshold || '90', 10) || 90, 30), 365);
      const nextLimit = Math.min(Math.max(parseInt(crmSettings.limit || '20', 10) || 20, 5), 100);
      const nextA = Math.min(Math.max(parseInt(crmSettings.priorityAThreshold || '140', 10) || 140, 60), 400);
      const nextBRaw = Math.min(Math.max(parseInt(crmSettings.priorityBThreshold || '105', 10) || 105, 30), 300);
      const nextB = Math.min(nextBRaw, nextA - 1);
      const nextValuePerPoint = Math.min(Math.max(parseInt(crmSettings.valuePerPoint || '200000', 10) || 200000, 50000), 2000000);
      const nextValueBonusCap = Math.min(Math.max(parseInt(crmSettings.valueBonusCap || '50', 10) || 50, 0), 200);
      const nextLifetimeValuePerPoint = Math.min(Math.max(parseInt(crmSettings.lifetimeValuePerPoint || '1500000', 10) || 1500000, 100000), 10000000);
      const nextLifetimeValueBonusCap = Math.min(Math.max(parseInt(crmSettings.lifetimeValueBonusCap || '35', 10) || 35, 0), 200);
      const nextServiceCountPoint = Math.min(Math.max(parseInt(crmSettings.serviceCountPoint || '3', 10) || 3, 0), 20);
      const nextServiceCountBonusCap = Math.min(Math.max(parseInt(crmSettings.serviceCountBonusCap || '25', 10) || 25, 0), 200);
      const nextOverduePoint = Math.min(Math.max(parseInt(crmSettings.overduePoint || '15', 10) || 15, 0), 100);
      const nextOverdueBonusCap = Math.min(Math.max(parseInt(crmSettings.overdueBonusCap || '40', 10) || 40, 0), 300);

      const nextSettings = {
        ...(tenantRow.settings || {}),
        dashboard: {
          ...((tenantRow.settings || {}).dashboard || {}),
          crm: {
            ...((tenantRow.settings || {}).dashboard?.crm || {}),
            daysThreshold: nextDays,
            limit: nextLimit,
            priorityAThreshold: nextA,
            priorityBThreshold: nextB,
            valuePerPoint: nextValuePerPoint,
            valueBonusCap: nextValueBonusCap,
            lifetimeValuePerPoint: nextLifetimeValuePerPoint,
            lifetimeValueBonusCap: nextLifetimeValueBonusCap,
            serviceCountPoint: nextServiceCountPoint,
            serviceCountBonusCap: nextServiceCountBonusCap,
            overduePoint: nextOverduePoint,
            overdueBonusCap: nextOverdueBonusCap,
            onlyHasPhone: crmSettings.onlyHasPhone,
            prioritizeHighValue: crmSettings.prioritizeHighValue,
          },
        },
      };

      const res = await fetchWithAuth('/api/tenants', {
        method: 'PUT',
        body: JSON.stringify({
          id: tenantRow.id,
          name: tenantRow.name,
          code: tenantRow.code,
          phone: tenantRow.phone,
          address: tenantRow.address,
          settings: nextSettings,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.message || 'Không lưu được cấu hình CRM');
        return;
      }

      setTenantRow((prev) => prev ? { ...prev, settings: nextSettings } : prev);
      setCrmSettings((prev) => ({
        ...prev,
        daysThreshold: String(nextDays),
        limit: String(nextLimit),
        priorityAThreshold: String(nextA),
        priorityBThreshold: String(nextB),
        valuePerPoint: String(nextValuePerPoint),
        valueBonusCap: String(nextValueBonusCap),
        lifetimeValuePerPoint: String(nextLifetimeValuePerPoint),
        lifetimeValueBonusCap: String(nextLifetimeValueBonusCap),
        serviceCountPoint: String(nextServiceCountPoint),
        serviceCountBonusCap: String(nextServiceCountBonusCap),
        overduePoint: String(nextOverduePoint),
        overdueBonusCap: String(nextOverdueBonusCap),
      }));
      setOnlyHasPhone(crmSettings.onlyHasPhone);
      toast.success('Đã lưu cấu hình CRM');
      setPage(1);
      fetchData();
    } catch {
      toast.error('Không lưu được cấu hình CRM');
    } finally {
      setSettingsSaving(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get<ApiResponse>('/api/crm/customers', {
        params: {
          page,
          pageSize,
          search: search || undefined,
          careStatus,
          priority,
          onlyHasPhone,
          sortBy: 'priority',
          sortDir: 'asc',
        },
      });
      setData(res.data);
    } catch {
      toast.error('Không tải được danh sách chăm sóc khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentTenantId) return;
    fetchData();
  }, [currentTenantId, page, pageSize, careStatus, priority, onlyHasPhone]);

  useEffect(() => {
    if (!currentTenantId || !isOwnerOrAdmin) return;
    loadCrmSettings();
  }, [currentTenantId, isOwnerOrAdmin]);

  const onSearch = () => {
    setPage(1);
    fetchData();
  };

  const updateCareStatus = async (benhnhanId: number, status: 'da_goi' | 'hen_goi_lai' | 'da_chot_lich') => {
    setUpdatingId(benhnhanId);
    try {
      const payload: any = { benhnhan_id: benhnhanId, status };
      if (status === 'hen_goi_lai') {
        const next = new Date();
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
        payload.next_call_at = next.toISOString();
      }
      await axios.put('/api/crm/care-status', payload);
      toast.success('Đã cập nhật trạng thái');
      fetchData();
    } catch {
      toast.error('Không cập nhật được trạng thái');
    } finally {
      setUpdatingId(null);
    }
  };

  const list = data?.items || [];
  const paging = data?.pagination;

  const titleSummary = useMemo(() => {
    if (!data) return 'Đang tải...';
    return `A ${data.summary.priority.A} • B ${data.summary.priority.B} • C ${data.summary.priority.C}`;
  }, [data]);

  return (
    <ProtectedRoute>
      <FeatureGate feature="crm">
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto py-4 px-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Chăm sóc khách hàng</h1>
              <p className="text-xs text-gray-500">Ưu tiên gọi theo thứ tự Cấp A → Cấp B → Cấp C ({titleSummary})</p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isOwnerOrAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Cấu hình chăm sóc khách hàng</p>
                  <p className="text-xs text-gray-500">Chỉ mở phần này khi bạn cần chỉnh quy tắc ưu tiên.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className="h-8 px-3 rounded border text-xs"
                >
                  {showSettings ? 'Ẩn cài đặt' : 'Mở cài đặt'}
                </button>
              </div>

              {showSettings && (
                <>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-1">
                    <p className="font-semibold">Hướng dẫn nhanh</p>
                    <p>1. Điểm càng cao thì ưu tiên càng cao: Cấp A &gt; Cấp B &gt; Cấp C.</p>
                    <p>2. Sau khi chỉnh thông số, bấm Lưu cấu hình CRM để áp dụng cho danh sách này và dashboard.</p>
                    <p>3. Nếu chưa chắc, có thể chọn preset hoặc bấm Khôi phục mặc định.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">Thiết lập nhanh:</span>
                    <button type="button" onClick={() => handleApplyPreset('small')} className="h-8 px-3 rounded border text-xs">Nhỏ</button>
                    <button type="button" onClick={() => handleApplyPreset('medium')} className="h-8 px-3 rounded border text-xs">Vừa</button>
                    <button type="button" onClick={() => handleApplyPreset('large')} className="h-8 px-3 rounded border text-xs">Lớn</button>
                    <button type="button" onClick={handleResetCrmDefaults} className="h-8 px-3 rounded border text-xs">Khôi phục mặc định</button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="text-xs text-gray-600">
                      Bắt đầu nhắc khi khách vắng bao nhiêu ngày
                      <input type="number" min={30} max={365} value={crmSettings.daysThreshold} onChange={(e) => setCrmSettings((p) => ({ ...p, daysThreshold: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Hiển thị tối đa bao nhiêu khách
                      <input type="number" min={5} max={100} value={crmSettings.limit} onChange={(e) => setCrmSettings((p) => ({ ...p, limit: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Điểm tối thiểu để vào Cấp A
                      <input type="number" min={60} max={400} value={crmSettings.priorityAThreshold} onChange={(e) => setCrmSettings((p) => ({ ...p, priorityAThreshold: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Điểm tối thiểu để vào Cấp B
                      <input type="number" min={30} max={300} value={crmSettings.priorityBThreshold} onChange={(e) => setCrmSettings((p) => ({ ...p, priorityBThreshold: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Đơn gần nhất: bao nhiêu tiền được +1 điểm
                      <input type="number" min={50000} max={2000000} value={crmSettings.valuePerPoint} onChange={(e) => setCrmSettings((p) => ({ ...p, valuePerPoint: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Giới hạn điểm từ đơn gần nhất
                      <input type="number" min={0} max={200} value={crmSettings.valueBonusCap} onChange={(e) => setCrmSettings((p) => ({ ...p, valueBonusCap: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Tổng chi tiêu: bao nhiêu tiền được +1 điểm
                      <input type="number" min={100000} max={10000000} value={crmSettings.lifetimeValuePerPoint} onChange={(e) => setCrmSettings((p) => ({ ...p, lifetimeValuePerPoint: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Giới hạn điểm từ tổng chi tiêu
                      <input type="number" min={0} max={200} value={crmSettings.lifetimeValueBonusCap} onChange={(e) => setCrmSettings((p) => ({ ...p, lifetimeValueBonusCap: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Mỗi lần sử dụng dịch vụ được cộng điểm
                      <input type="number" min={0} max={20} value={crmSettings.serviceCountPoint} onChange={(e) => setCrmSettings((p) => ({ ...p, serviceCountPoint: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Giới hạn điểm từ số lần sử dụng dịch vụ
                      <input type="number" min={0} max={200} value={crmSettings.serviceCountBonusCap} onChange={(e) => setCrmSettings((p) => ({ ...p, serviceCountBonusCap: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Mỗi lịch hẹn quá hạn được cộng điểm
                      <input type="number" min={0} max={100} value={crmSettings.overduePoint} onChange={(e) => setCrmSettings((p) => ({ ...p, overduePoint: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                    <label className="text-xs text-gray-600">
                      Giới hạn điểm từ lịch hẹn quá hạn
                      <input type="number" min={0} max={300} value={crmSettings.overdueBonusCap} onChange={(e) => setCrmSettings((p) => ({ ...p, overdueBonusCap: e.target.value }))} className="mt-1 h-9 w-full border rounded px-2" />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={crmSettings.onlyHasPhone}
                        onChange={(e) => {
                          setCrmSettings((p) => ({ ...p, onlyHasPhone: e.target.checked }));
                          setOnlyHasPhone(e.target.checked);
                        }}
                      />
                      Chỉ hiện khách có số điện thoại
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={crmSettings.prioritizeHighValue}
                        onChange={(e) => setCrmSettings((p) => ({ ...p, prioritizeHighValue: e.target.checked }))}
                      />
                      Ưu tiên khách có giá trị đơn gần nhất cao
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveCrmSettings}
                      disabled={settingsSaving || settingsLoading}
                      className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {settingsSaving ? 'Đang lưu...' : 'Lưu cấu hình CRM'}
                    </button>
                    <button
                      type="button"
                      onClick={loadCrmSettings}
                      disabled={settingsLoading}
                      className="h-9 px-4 rounded-lg border text-sm"
                    >
                      {settingsLoading ? 'Đang tải...' : 'Tải lại cấu hình'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-3 grid grid-cols-1 md:grid-cols-12 gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
              placeholder="Tìm theo tên hoặc số điện thoại"
              className="md:col-span-4 h-10 border rounded-lg px-3 text-sm"
            />
            <select value={careStatus} onChange={(e) => { setPage(1); setCareStatus(e.target.value as any); }} className="md:col-span-2 h-10 border rounded-lg px-2 text-sm">
              <option value="all">Tất cả trạng thái</option>
              <option value="chua_lien_he">Chưa liên hệ</option>
              <option value="hen_goi_lai">Hẹn gọi lại</option>
              <option value="da_goi">Đã gọi</option>
              <option value="da_chot_lich">Đã chốt lịch</option>
            </select>
            <select value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value as any); }} className="md:col-span-2 h-10 border rounded-lg px-2 text-sm">
              <option value="all">Tất cả ưu tiên</option>
              <option value="A">Cấp A</option>
              <option value="B">Cấp B</option>
              <option value="C">Cấp C</option>
            </select>
            <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }} className="md:col-span-2 h-10 border rounded-lg px-2 text-sm">
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
            <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 px-2">
              <input type="checkbox" checked={onlyHasPhone} onChange={(e) => { setPage(1); setOnlyHasPhone(e.target.checked); }} />
              Chỉ có SĐT
            </label>
            <div className="md:col-span-12 flex justify-end">
              <button type="button" onClick={onSearch} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Tìm</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-teal-50 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-sm text-teal-800">Danh sách chăm sóc</span>
              <span className="ml-auto text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full">{paging?.total || 0}</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Đang tải...</div>
            ) : list.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Không có dữ liệu phù hợp bộ lọc</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Khách hàng</th>
                      <th className="text-left px-3 py-2">Ưu tiên</th>
                      <th className="text-left px-3 py-2">Trạng thái</th>
                      <th className="text-right px-3 py-2">Ngày vắng</th>
                      <th className="text-right px-3 py-2">Đơn gần nhất</th>
                      <th className="text-right px-3 py-2">Tổng dịch vụ</th>
                      <th className="text-right px-3 py-2">Số lần</th>
                      <th className="text-right px-3 py-2">Hẹn quá hạn</th>
                      <th className="text-right px-3 py-2">Điểm</th>
                      <th className="text-left px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-teal-50/40">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{c.ten}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span>{c.dienthoai || 'Chưa có SĐT'}</span>
                            <Link href={`/ke-don-kinh?bn=${c.id}`} className="text-blue-600 hover:text-blue-800">Mở hồ sơ</Link>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${priorityLabel(c.muc_uu_tien).cls}`}>{priorityLabel(c.muc_uu_tien).text}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${careStatusLabel(c.care_status).cls}`}>{careStatusLabel(c.care_status).text}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{c.so_ngay}</td>
                        <td className="px-3 py-2 text-right">{money(c.gia_tri_don_gan_nhat)}</td>
                        <td className="px-3 py-2 text-right">{money(c.tong_gia_tri_dich_vu)}</td>
                        <td className="px-3 py-2 text-right">{c.so_lan_su_dung_dich_vu}</td>
                        <td className="px-3 py-2 text-right">{c.so_hen_qua_han}</td>
                        <td className="px-3 py-2 text-right font-semibold">{c.uu_tien}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={updatingId === c.id}
                              onClick={() => updateCareStatus(c.id, 'da_goi')}
                              className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                            >Đã gọi</button>
                            <button
                              type="button"
                              disabled={updatingId === c.id}
                              onClick={() => updateCareStatus(c.id, 'hen_goi_lai')}
                              className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                            >Hẹn gọi lại</button>
                            <button
                              type="button"
                              disabled={updatingId === c.id}
                              onClick={() => updateCareStatus(c.id, 'da_chot_lich')}
                              className="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                            >Đã chốt lịch</button>
                            {c.dienthoai && (
                              <a href={`tel:${c.dienthoai}`} className="p-1 text-green-600 hover:bg-green-100 rounded">
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-4 py-3 border-t flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Trang {paging?.page || 1} / {paging?.totalPages || 1} • Tổng {paging?.total || 0} khách
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!paging || paging.page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-1.5 rounded border text-gray-700 disabled:opacity-40"
                >Trước</button>
                <button
                  type="button"
                  disabled={!paging || paging.page >= paging.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded border text-gray-700 disabled:opacity-40"
                >Sau</button>
              </div>
            </div>
          </div>
        </main>
      </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
