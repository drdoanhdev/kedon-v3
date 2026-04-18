import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { HeartHandshake, Phone, RefreshCw } from 'lucide-react';

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
  if (tier === 'A') return { text: 'Rất khẩn', cls: 'bg-red-100 text-red-700' };
  if (tier === 'B') return { text: 'Khẩn', cls: 'bg-orange-100 text-orange-700' };
  return { text: 'Theo dõi', cls: 'bg-teal-100 text-teal-700' };
}

export default function ChamSocKhachHangPage() {
  const { currentTenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const [search, setSearch] = useState('');
  const [careStatus, setCareStatus] = useState<'all' | CareStatus>('all');
  const [priority, setPriority] = useState<'all' | PriorityTier>('all');
  const [onlyHasPhone, setOnlyHasPhone] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
          _t: Date.now(),
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
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto py-4 px-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Chăm sóc khách hàng</h1>
              <p className="text-xs text-gray-500">Ưu tiên gọi theo thứ tự Rất khẩn → Khẩn → Theo dõi ({titleSummary})</p>
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
              <option value="A">Rất khẩn (A)</option>
              <option value="B">Khẩn (B)</option>
              <option value="C">Theo dõi (C)</option>
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
    </ProtectedRoute>
  );
}
