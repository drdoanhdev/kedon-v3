//src/pages/thuoc.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';

interface Thuoc {
  id?: number;
  mathuoc: string;
  tenthuoc: string;
  donvitinh: string;
  cachdung: string;
  hoatchat: string;
  giaban: number;
  gianhap: number;
  tonkho: number;
  soluongmacdinh: number;
  la_thu_thuat: boolean;
  ngung_kinh_doanh: boolean;
}

export default function ThuocPage() {
  const { confirm } = useConfirm();
  const [thuocs, setThuocs] = useState<Thuoc[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Thuoc>({
    mathuoc: '',
    tenthuoc: '',
    donvitinh: '',
    cachdung: '',
    hoatchat: '',
    giaban: 0,
    gianhap: 0,
    tonkho: 0,
    soluongmacdinh: 1,
    la_thu_thuat: false,
    ngung_kinh_doanh: false,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const res1 = await axios.get(`/api/thuoc?_t=${timestamp}&_r=${random}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setThuocs(res1.data.data || []);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi tải dữ liệu: ' + message);
    }
  };

  const generateMaThuoc = (list: Thuoc[]) => {
    const max = list.reduce((acc, cur) => {
      const match = cur.mathuoc?.match(/TH(\d+)/);
      const num = match ? parseInt(match[1]) : 0;
      return Math.max(acc, num);
    }, 0);
    return `TH${(max + 1).toString().padStart(5, '0')}`;
  };

  const handleSubmit = async () => {
    if (!form.tenthuoc || !form.donvitinh) {
      toast.error('Vui lòng nhập tên thuốc và đơn vị.');
      return;
    }
    try {
      const payload = { ...form };
      if (!isEditing) {
        payload.mathuoc = payload.mathuoc || generateMaThuoc(thuocs);
        await axios.post('/api/thuoc', payload);
        toast.success('Đã thêm thuốc');
      } else {
        await axios.put('/api/thuoc', payload);
        toast.success('Đã cập nhật thuốc');
      }
      setOpen(false);
      fetchAll();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi lưu thuốc: ' + message);
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirm('Bạn có chắc muốn xoá thuốc này?')) {
      try {
        await axios.delete(`/api/thuoc?id=${id}`);
        toast.success('Đã xoá thuốc');
        fetchAll();
      } catch (error: unknown) {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error
            ? error.message
            : String(error);
        toast.error('Lỗi khi xoá thuốc: ' + message);
      }
    }
  };

  const handleEdit = (t: Thuoc) => {
    setForm(t);
    setIsEditing(true);
    setOpen(true);
  };

  const filtered = thuocs.filter((t) => {
    if (!showInactive && t.ngung_kinh_doanh) return false;
    return t.tenthuoc.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <ProtectedRoute>
      <div className="p-6 space-y-4">

        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-semibold">Danh sách thuốc</h1>
            <Button
              onClick={() => {
                setIsEditing(false);
                setForm({
                  mathuoc: '',
                  tenthuoc: '',
                  donvitinh: '',
                  cachdung: '',
                  hoatchat: '',
                  giaban: 0,
                  gianhap: 0,
                  tonkho: 0,
                  soluongmacdinh: 1,
                  la_thu_thuat: false,
                  ngung_kinh_doanh: false,
                });
                setOpen(true);
              }}
            >
              Thêm thuốc
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Input
              placeholder="Tìm kiếm thuốc..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-1/2"
            />
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 whitespace-nowrap border ${
                showInactive ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {showInactive ? 'Đang xem ngừng KD' : 'Xem ngừng KD'}
            </button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-2 py-1">Mã</th>
                    <th className="px-2 py-1">Tên</th>
                    <th className="px-2 py-1">Hoạt chất</th>
                    <th className="px-2 py-1">Giá bán</th>
                    <th className="px-2 py-1">Tồn</th>
                    <th className="px-2 py-1">Thủ thuật</th>
                    <th className="px-2 py-1">Trạng thái</th>
                    <th className="px-2 py-1 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className={`border-b hover:bg-gray-50 ${t.ngung_kinh_doanh ? 'opacity-50 bg-gray-50' : ''}`}>
                      <td className="px-2 py-1 font-mono">{t.mathuoc}</td>
                      <td className="px-2 py-1">{t.tenthuoc}</td>
                      <td className="px-2 py-1">{t.hoatchat}</td>
                      <td className="px-2 py-1">{t.giaban.toLocaleString()}</td>
                      <td className="px-2 py-1">{t.tonkho}</td>
                      <td className="px-2 py-1">{t.la_thu_thuat ? 'Có' : 'Không'}</td>
                      <td className="px-2 py-1">
                        {t.ngung_kinh_doanh
                          ? <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Ngừng KD</span>
                          : <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Đang KD</span>}
                      </td>
                      <td className="px-2 py-1 text-center space-x-1">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(t)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id!)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

        {/* Dialog thêm/sửa thuốc */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Sửa thuốc' : 'Thêm thuốc'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Tên thuốc</Label>
              <Input
                value={form.tenthuoc}
                onChange={(e) => setForm({ ...form, tenthuoc: e.target.value })}
              />
              <Label>Đơn vị</Label>
              <Input
                value={form.donvitinh}
                onChange={(e) => setForm({ ...form, donvitinh: e.target.value })}
              />
              <Label>Hoạt chất</Label>
              <Input
                value={form.hoatchat}
                onChange={(e) => setForm({ ...form, hoatchat: e.target.value })}
              />
              <Label>Cách dùng</Label>
              <Input
                value={form.cachdung}
                onChange={(e) => setForm({ ...form, cachdung: e.target.value })}
              />
              <Label>Giá bán</Label>
              <Input
                type="number"
                value={form.giaban}
                onChange={(e) => setForm({ ...form, giaban: +e.target.value })}
              />
              <Label>Giá nhập</Label>
              <Input
                type="number"
                value={form.gianhap}
                onChange={(e) => setForm({ ...form, gianhap: +e.target.value })}
              />
              <Label>Tồn kho</Label>
              <Input
                type="number"
                value={form.tonkho}
                onChange={(e) => setForm({ ...form, tonkho: +e.target.value })}
              />
              <Label>Số lượng mặc định</Label>
              <Input
                type="number"
                value={form.soluongmacdinh}
                onChange={(e) => setForm({ ...form, soluongmacdinh: +e.target.value })}
              />
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Label>Là thủ thuật</Label>
                  <input
                    type="checkbox"
                    checked={form.la_thu_thuat}
                    onChange={(e) => setForm({ ...form, la_thu_thuat: e.target.checked })}
                    className="w-4 h-4 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label>Ngừng kinh doanh</Label>
                  <input
                    type="checkbox"
                    checked={form.ngung_kinh_doanh}
                    onChange={(e) => setForm({ ...form, ngung_kinh_doanh: e.target.checked })}
                    className="w-4 h-4 border-red-300 rounded focus:ring-red-500"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button onClick={handleSubmit}>Lưu</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}