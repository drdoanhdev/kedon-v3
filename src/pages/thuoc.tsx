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
import { Pencil, Trash2, Plus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';

interface NhomThuoc {
  id: number;
  ten: string;
}

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
  nhomthuocs: number[];
  la_thu_thuat: boolean;
}

export default function ThuocPage() {
  const [thuocs, setThuocs] = useState<Thuoc[]>([]);
  const [nhomThuocs, setNhomThuocs] = useState<NhomThuoc[]>([]);
  const [search, setSearch] = useState('');
  const [selectedNhom, setSelectedNhom] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingNhom, setEditingNhom] = useState<NhomThuoc | null>(null);
  const [tenNhomMoi, setTenNhomMoi] = useState('');
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
    nhomthuocs: [],
    la_thu_thuat: false,
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
      const res2 = await axios.get(`/api/nhom-thuoc?_t=${timestamp}&_r=${random}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setThuocs(res1.data.data || []);
      setNhomThuocs(res2.data.data || []);
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
    if (confirm('Bạn có chắc muốn xoá thuốc này?')) {
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

  const toggleNhomThuoc = (id: number) => {
    setForm((prev) => ({
      ...prev,
      nhomthuocs: prev.nhomthuocs.includes(id)
        ? prev.nhomthuocs.filter((n) => n !== id)
        : [...prev.nhomthuocs, id],
    }));
  };

  const handleAddNhom = async () => {
    if (!tenNhomMoi.trim()) {
      toast.error('Vui lòng nhập tên nhóm thuốc');
      return;
    }
    try {
      if (editingNhom?.id === 0) {
        await axios.post('/api/nhom-thuoc', { ten: tenNhomMoi });
        toast.success('Đã thêm nhóm thuốc');
      } else {
        await axios.put('/api/nhom-thuoc', { id: editingNhom?.id, ten: tenNhomMoi });
        toast.success('Đã cập nhật nhóm thuốc');
      }
      setEditingNhom(null);
      setTenNhomMoi('');
      fetchAll();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi lưu nhóm thuốc: ' + message);
    }
  };

  const handleDeleteNhom = async () => {
    if (!editingNhom) return;
    try {
      await axios.delete(`/api/nhom-thuoc?id=${editingNhom.id}`);
      toast.success('Đã xoá nhóm thuốc');
      setEditingNhom(null);
      setTenNhomMoi('');
      fetchAll();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi xoá nhóm thuốc: ' + message);
    }
  };

  const filtered = thuocs.filter((t) => {
    const matchTen = t.tenthuoc.toLowerCase().includes(search.toLowerCase());
    const matchNhom = selectedNhom ? t.nhomthuocs.includes(selectedNhom) : true;
    return matchTen && matchNhom;
  });

  return (
    <ProtectedRoute>
      <div className="p-6 grid grid-cols-5 gap-6">
        <Toaster position="top-right" />
        <div className="col-span-1 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Nhóm thuốc</h2>
            <button
              onClick={() => {
                setEditingNhom({ id: 0, ten: '' });
                setTenNhomMoi('');
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1">
            <li
              className={`px-2 py-1 rounded cursor-pointer ${selectedNhom === null ? 'bg-blue-100' : ''}`}
              onClick={() => setSelectedNhom(null)}
            >
              Tất cả
            </li>
            {nhomThuocs.map((n) => (
              <li
                key={n.id}
                className={`flex justify-between items-center group hover:bg-gray-100 px-2 py-1 rounded cursor-pointer ${selectedNhom === n.id ? 'bg-blue-100' : ''}`}
                onClick={() => setSelectedNhom(n.id)}
              >
                <span>{n.ten}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingNhom(n);
                    setTenNhomMoi(n.ten);
                  }}
                  className="invisible group-hover:visible"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-4 space-y-4">
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
                  nhomthuocs: [],
                  la_thu_thuat: false,
                });
                setOpen(true);
              }}
            >
              Thêm thuốc
            </Button>
          </div>

          <Input
            placeholder="Tìm kiếm thuốc..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-1/2"
          />

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-2 py-1">Mã</th>
                    <th className="px-2 py-1">Tên</th>
                    <th className="px-2 py-1">Nhóm</th>
                    <th className="px-2 py-1">Hoạt chất</th>
                    <th className="px-2 py-1">Giá bán</th>
                    <th className="px-2 py-1">Tồn</th>
                    <th className="px-2 py-1">Thủ thuật</th>
                    <th className="px-2 py-1 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1 font-mono">{t.mathuoc}</td>
                      <td className="px-2 py-1">{t.tenthuoc}</td>
                      <td className="px-2 py-1">
                        {nhomThuocs
                          .filter((n) => t.nhomthuocs.includes(n.id))
                          .map((n) => n.ten)
                          .join(', ')}
                      </td>
                      <td className="px-2 py-1">{t.hoatchat}</td>
                      <td className="px-2 py-1">{t.giaban.toLocaleString()}</td>
                      <td className="px-2 py-1">{t.tonkho}</td>
                      <td className="px-2 py-1">{t.la_thu_thuat ? 'Có' : 'Không'}</td>
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
        </div>

        {/* Dialog sửa nhóm */}
        <Dialog open={!!editingNhom} onOpenChange={() => setEditingNhom(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingNhom?.id ? 'Sửa nhóm thuốc' : 'Thêm nhóm thuốc'}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Tên nhóm"
              value={tenNhomMoi}
              onChange={(e) => setTenNhomMoi(e.target.value)}
            />
            <DialogFooter>
              <div className="flex justify-between w-full">
                {editingNhom?.id !== 0 && (
                  <Button variant="destructive" onClick={handleDeleteNhom}>
                    Xoá
                  </Button>
                )}
                <div className="space-x-2">
                  <Button variant="outline" onClick={() => setEditingNhom(null)}>
                    Huỷ
                  </Button>
                  <Button onClick={handleAddNhom}>Lưu</Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              <Label>Là thủ thuật</Label>
              <input
                type="checkbox"
                checked={form.la_thu_thuat}
                onChange={(e) => setForm({ ...form, la_thu_thuat: e.target.checked })}
                className="w-4 h-4 border-gray-300 rounded focus:ring-blue-500"
              />
              <Label>Nhóm thuốc</Label>
              <div className="flex flex-wrap gap-2">
                {nhomThuocs.map((n) => (
                  <label key={n.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={form.nhomthuocs.includes(n.id)}
                      onChange={() => toggleNhomThuoc(n.id)}
                    />
                    <span>{n.ten}</span>
                  </label>
                ))}
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