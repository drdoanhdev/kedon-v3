// Tra cứu khách hàng tất cả chi nhánh + Chuyển khách hàng
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import {
  Search, Users, Building2, ArrowRightLeft, Phone, MapPin,
  FileText, Glasses, ChevronDown, ChevronUp, X
} from 'lucide-react';

interface Branch {
  id: string;
  ten_chi_nhanh: string;
  is_main: boolean;
}

interface Patient {
  id: number;
  ten: string;
  mabenhnhan: string;
  namsinh: string | null;
  dienthoai: string | null;
  diachi: string | null;
  gioitinh: string | null;
  branch_id: string | null;
  branch?: { id: string; ten_chi_nhanh: string } | null;
  tong_don_thuoc: number;
  tong_don_kinh: number;
}

export default function TraCuuKhachHang() {
  const { currentTenantId, tenancyLoading } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [page, setPage] = useState(1);

  // Transfer dialog
  const [transferPatient, setTransferPatient] = useState<Patient | null>(null);
  const [transferBranchId, setTransferBranchId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Expand row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadBranches = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const res = await fetchWithAuth('/api/branches?status=active');
      if (res.ok) setBranches(await res.json());
    } catch {}
  }, [currentTenantId]);

  const searchPatients = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (search.trim()) params.set('search', search.trim());
      if (filterBranch) params.set('branch_id', filterBranch);

      const res = await fetchWithAuth(`/api/branches/patients?${params}`);
      if (res.ok) {
        const result = await res.json();
        setPatients(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [currentTenantId, search, filterBranch, page]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) loadBranches();
  }, [tenancyLoading, currentTenantId, loadBranches]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) searchPatients();
  }, [tenancyLoading, currentTenantId, searchPatients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    searchPatients();
  };

  const handleTransfer = async () => {
    if (!transferPatient || !transferBranchId) {
      toast.error('Vui lòng chọn chi nhánh đích');
      return;
    }
    setTransferring(true);
    try {
      const res = await fetchWithAuth('/api/branches/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benhnhan_id: transferPatient.id,
          to_branch_id: transferBranchId,
          ly_do: transferReason || null,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message || 'Đã chuyển khách hàng');
        setTransferPatient(null);
        setTransferBranchId('');
        setTransferReason('');
        searchPatients();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
    setTransferring(false);
  };

  if (tenancyLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Search className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Tra cứu khách hàng</h1>
              <p className="text-sm text-gray-500">Tìm kiếm và quản lý khách hàng tại tất cả chi nhánh</p>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-3 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm theo tên, SĐT, mã bệnh nhân..."
                className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
              />
            </div>
            <select
              value={filterBranch}
              onChange={e => { setFilterBranch(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2.5 text-sm bg-white min-w-[180px]"
            >
              <option value="">Tất cả chi nhánh</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>)}
            </select>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Tìm kiếm
            </button>
          </form>

          {/* Results */}
          <div className="text-sm text-gray-400 mb-3">{total} khách hàng</div>

          {loading ? (
            <div className="text-center py-10 text-gray-400">Đang tải...</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Không tìm thấy khách hàng</p>
            </div>
          ) : (
            <div className="space-y-2">
              {patients.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div
                    className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  >
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {(p.ten?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{p.ten}</span>
                        <span className="text-[11px] text-gray-400">{p.mabenhnhan}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        {p.dienthoai && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.dienthoai}</span>}
                        {p.branch && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Building2 className="w-3 h-3" />{p.branch.ten_chi_nhanh}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                      <span className="flex items-center gap-1" title="Đơn thuốc">
                        <FileText className="w-3.5 h-3.5" />{p.tong_don_thuoc}
                      </span>
                      <span className="flex items-center gap-1" title="Đơn kính">
                        <Glasses className="w-3.5 h-3.5" />{p.tong_don_kinh}
                      </span>
                      {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === p.id && (
                    <div className="border-t px-4 py-3 bg-gray-50/50">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-gray-400 text-xs">Năm sinh</span>
                          <p className="text-gray-800">{p.namsinh || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Giới tính</span>
                          <p className="text-gray-800">{p.gioitinh || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Điện thoại</span>
                          <p className="text-gray-800">{p.dienthoai || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Địa chỉ</span>
                          <p className="text-gray-800 truncate">{p.diachi || '—'}</p>
                        </div>
                      </div>

                      {/* Transfer button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransferPatient(p);
                          setTransferBranchId('');
                          setTransferReason('');
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 text-xs font-medium"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Chuyển chi nhánh
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > 30 && (
            <div className="flex justify-center gap-2 mt-6">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50">Trước</button>
              <span className="px-3 py-1.5 text-sm text-gray-500">Trang {page} / {Math.ceil(total / 30)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50">Sau</button>
            </div>
          )}

          {/* Transfer Dialog */}
          {transferPatient && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Chuyển khách hàng</h3>
                  <button onClick={() => setTransferPatient(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 mb-4">
                  <p className="text-sm font-medium text-gray-800">{transferPatient.ten}</p>
                  <p className="text-xs text-gray-500">
                    {transferPatient.mabenhnhan}
                    {transferPatient.branch && ` • Hiện tại: ${transferPatient.branch.ten_chi_nhanh}`}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Chuyển đến chi nhánh *</label>
                    <select
                      value={transferBranchId}
                      onChange={e => setTransferBranchId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Chọn chi nhánh --</option>
                      {branches
                        .filter(b => b.id !== transferPatient.branch_id)
                        .map(b => <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Lý do (tùy chọn)</label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={e => setTransferReason(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="VD: Khách chuyển sang gần nhà hơn..."
                    />
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 mt-3">
                  Lưu ý: Đơn thuốc/kính cũ vẫn giữ nguyên ở chi nhánh đã tạo. Chỉ thay đổi chi nhánh quản lý chính.
                </p>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleTransfer}
                    disabled={transferring || !transferBranchId}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    {transferring ? 'Đang chuyển...' : 'Xác nhận chuyển'}
                  </button>
                  <button onClick={() => setTransferPatient(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
