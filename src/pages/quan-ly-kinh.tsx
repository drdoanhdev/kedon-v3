//src/pages/quan-ly-kinh.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Pencil, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';

interface HangTrong {
  id: number;
  ten_hang: string;
  gia_nhap: number;
  gia_ban: number;
  mo_ta?: string;
}

interface GongKinh {
  id: number;
  ten_gong: string;
  chat_lieu?: string;
  gia_nhap: number;
  gia_ban: number;
  mo_ta?: string;
}

interface MauThiLuc {
  id: number;
  gia_tri: string;
  thu_tu: number;
}

interface MauSoKinh {
  id: number;
  so_kinh: string;
  thu_tu: number;
}

export default function QuanLyKinh() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'hang-trong' | 'gong-kinh' | 'mau-du-lieu'>('hang-trong');
  
  // States cho hãng tròng
  const [dsHangTrong, setDsHangTrong] = useState<HangTrong[]>([]);
  const [hangTrongForm, setHangTrongForm] = useState({
    id: 0,
    ten_hang: '',
    gia_nhap: '',
    gia_ban: '',
    mo_ta: ''
  });
  const [editingHangTrong, setEditingHangTrong] = useState<number | null>(null);

  // States cho gọng kính
  const [dsGongKinh, setDsGongKinh] = useState<GongKinh[]>([]);
  const [gongKinhForm, setGongKinhForm] = useState({
    id: 0,
    ten_gong: '',
    chat_lieu: '',
    gia_nhap: '',
    gia_ban: '',
    mo_ta: ''
  });
  const [editingGongKinh, setEditingGongKinh] = useState<number | null>(null);

  // States cho mẫu dữ liệu
  const [dsThiLuc, setDsThiLuc] = useState<MauThiLuc[]>([]);
  const [dsSoKinh, setDsSoKinh] = useState<MauSoKinh[]>([]);
  const [thiLucForm, setThiLucForm] = useState({ gia_tri: '', thu_tu: '' });
  const [soKinhForm, setSoKinhForm] = useState({ so_kinh: '', thu_tu: '' });
  const [editingThiLuc, setEditingThiLuc] = useState<number | null>(null);
  const [editingSoKinh, setEditingSoKinh] = useState<number | null>(null);

  // Load dữ liệu
  useEffect(() => {
    loadHangTrong();
    loadGongKinh();
    loadMauDuLieu();
  }, []);

  const loadHangTrong = async () => {
    try {
      const res = await axios.get('/api/hang-trong');
      setDsHangTrong(res.data);
    } catch (error) {
      toast.error('Lỗi tải danh sách hãng tròng');
    }
  };

  const loadGongKinh = async () => {
    try {
      const res = await axios.get('/api/gong-kinh');
      setDsGongKinh(res.data);
    } catch (error) {
      toast.error('Lỗi tải danh sách gọng kính');
    }
  };

  const loadMauDuLieu = async () => {
    try {
      const [resThiLuc, resSoKinh] = await Promise.all([
        axios.get('/api/mau-kinh?type=thiluc'),
        axios.get('/api/mau-kinh?type=sokinh')
      ]);
      setDsThiLuc(resThiLuc.data);
      setDsSoKinh(resSoKinh.data);
    } catch (error) {
      toast.error('Lỗi tải mẫu dữ liệu');
    }
  };

  const saveHangTrong = async () => {
    if (!hangTrongForm.ten_hang.trim()) {
      toast.error('Vui lòng nhập tên hãng tròng');
      return;
    }

    try {
      const payload = {
        ...hangTrongForm,
        gia_nhap: parseInt(hangTrongForm.gia_nhap) || 0,
        gia_ban: parseInt(hangTrongForm.gia_ban) || 0
      };

      if (editingHangTrong) {
        await axios.put('/api/hang-trong', { ...payload, id: editingHangTrong });
        toast.success('Đã cập nhật hãng tròng');
        setEditingHangTrong(null);
      } else {
        await axios.post('/api/hang-trong', payload);
        toast.success('Đã thêm hãng tròng mới');
      }

      setHangTrongForm({ id: 0, ten_hang: '', gia_nhap: '', gia_ban: '', mo_ta: '' });
      loadHangTrong();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi lưu hãng tròng');
    }
  };

  const saveGongKinh = async () => {
    if (!gongKinhForm.ten_gong.trim()) {
      toast.error('Vui lòng nhập tên gọng kính');
      return;
    }

    try {
      const payload = {
        ...gongKinhForm,
        gia_nhap: parseInt(gongKinhForm.gia_nhap) || 0,
        gia_ban: parseInt(gongKinhForm.gia_ban) || 0
      };

      if (editingGongKinh) {
        await axios.put('/api/gong-kinh', { ...payload, id: editingGongKinh });
        toast.success('Đã cập nhật gọng kính');
        setEditingGongKinh(null);
      } else {
        await axios.post('/api/gong-kinh', payload);
        toast.success('Đã thêm gọng kính mới');
      }

      setGongKinhForm({ id: 0, ten_gong: '', chat_lieu: '', gia_nhap: '', gia_ban: '', mo_ta: '' });
      loadGongKinh();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi lưu gọng kính');
    }
  };

  const editHangTrong = (hang: HangTrong) => {
    setHangTrongForm({
      id: hang.id,
      ten_hang: hang.ten_hang,
      gia_nhap: hang.gia_nhap.toString(),
      gia_ban: hang.gia_ban.toString(),
      mo_ta: hang.mo_ta || ''
    });
    setEditingHangTrong(hang.id);
  };

  const editGongKinh = (gong: GongKinh) => {
    setGongKinhForm({
      id: gong.id,
      ten_gong: gong.ten_gong,
      chat_lieu: gong.chat_lieu || '',
      gia_nhap: gong.gia_nhap.toString(),
      gia_ban: gong.gia_ban.toString(),
      mo_ta: gong.mo_ta || ''
    });
    setEditingGongKinh(gong.id);
  };

  const deleteHangTrong = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa hãng tròng này?')) return;
    
    try {
      try {
        await axios.delete(`/api/hang-trong?id=${id}`);
      } catch (e) {
        // Fallback gửi trong body nếu server không nhận query
        await axios.delete('/api/hang-trong', { data: { id } });
      }
      toast.success('Đã xóa hãng tròng');
      loadHangTrong();
    } catch (error) {
      toast.error('Lỗi xóa hãng tròng');
    }
  };

  const deleteGongKinh = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa gọng kính này?')) return;
    
    try {
      await axios.delete('/api/gong-kinh', { data: { id } });
      toast.success('Đã xóa gọng kính');
      loadGongKinh();
    } catch (error) {
      toast.error('Lỗi xóa gọng kính');
    }
  };

  const saveThiLuc = async () => {
    if (!thiLucForm.gia_tri.trim()) {
      toast.error('Vui lòng nhập giá trị thị lực');
      return;
    }

    try {
      const payload = {
        type: 'thiluc',
        gia_tri: thiLucForm.gia_tri,
        thu_tu: parseInt(thiLucForm.thu_tu) || 0
      };

      if (editingThiLuc) {
        // API PUT cho thị lực
        const res = await axios.put('/api/mau-kinh', { ...payload, id: editingThiLuc });
        toast.success('Đã cập nhật mẫu thị lực');
        setEditingThiLuc(null);
      } else {
        await axios.post('/api/mau-kinh', payload);
        toast.success('Đã thêm mẫu thị lực mới');
      }

      setThiLucForm({ gia_tri: '', thu_tu: '' });
      loadMauDuLieu();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi lưu mẫu thị lực');
    }
  };

  const saveSoKinh = async () => {
    if (!soKinhForm.so_kinh.trim()) {
      toast.error('Vui lòng nhập số kính');
      return;
    }

    try {
      const payload = {
        type: 'sokinh',
        so_kinh: soKinhForm.so_kinh,
        thu_tu: parseInt(soKinhForm.thu_tu) || 0
      };

      if (editingSoKinh) {
        // API PUT cho số kính
        const res = await axios.put('/api/mau-kinh', { ...payload, id: editingSoKinh });
        toast.success('Đã cập nhật mẫu số kính');
        setEditingSoKinh(null);
      } else {
        await axios.post('/api/mau-kinh', payload);
        toast.success('Đã thêm mẫu số kính mới');
      }

      setSoKinhForm({ so_kinh: '', thu_tu: '' });
      loadMauDuLieu();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi lưu mẫu số kính');
    }
  };

  const editThiLuc = (item: MauThiLuc) => {
    setThiLucForm({
      gia_tri: item.gia_tri,
      thu_tu: item.thu_tu.toString()
    });
    setEditingThiLuc(item.id);
  };

  const editSoKinh = (item: MauSoKinh) => {
    setSoKinhForm({
      so_kinh: item.so_kinh,
      thu_tu: item.thu_tu.toString()
    });
    setEditingSoKinh(item.id);
  };

  const deleteThiLuc = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa mẫu thị lực này?')) return;
    
    try {
      await axios.delete('/api/mau-kinh', { data: { id, type: 'thiluc' } });
      toast.success('Đã xóa mẫu thị lực');
      loadMauDuLieu();
    } catch (error) {
      toast.error('Lỗi xóa mẫu thị lực');
    }
  };

  const deleteSoKinh = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa mẫu số kính này?')) return;
    
    try {
      await axios.delete('/api/mau-kinh', { data: { id, type: 'sokinh' } });
      toast.success('Đã xóa mẫu số kính');
      loadMauDuLieu();
    } catch (error) {
      toast.error('Lỗi xóa mẫu số kính');
    }
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-4">
        
        <h1 className="text-2xl font-bold mb-6">Quản lý danh mục kính</h1>

        {/* Tabs */}
        <div className="flex mb-6 border-b">
          <button
            className={`px-4 py-2 ${activeTab === 'hang-trong' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('hang-trong')}
          >
            Hãng tròng kính
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'gong-kinh' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('gong-kinh')}
          >
            Gọng kính
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'mau-du-lieu' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
            onClick={() => setActiveTab('mau-du-lieu')}
          >
            Mẫu dữ liệu
          </button>
        </div>

        {/* Tab Hãng tròng */}
        {activeTab === 'hang-trong' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Form thêm/sửa */}
            <Card>
              <CardHeader>
                <CardTitle>{editingHangTrong ? 'Sửa hãng tròng' : 'Thêm hãng tròng mới'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Tên hãng</label>
                  <Input
                    value={hangTrongForm.ten_hang}
                    onChange={(e) => setHangTrongForm({ ...hangTrongForm, ten_hang: e.target.value })}
                    placeholder="VD: Essilor, Hoya..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Giá nhập (VNĐ)</label>
                    <Input
                      type="number"
                      value={hangTrongForm.gia_nhap}
                      onChange={(e) => setHangTrongForm({ ...hangTrongForm, gia_nhap: e.target.value })}
                      placeholder="300000"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Giá bán (VNĐ)</label>
                    <Input
                      type="number"
                      value={hangTrongForm.gia_ban}
                      onChange={(e) => setHangTrongForm({ ...hangTrongForm, gia_ban: e.target.value })}
                      placeholder="500000"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Mô tả</label>
                  <Textarea
                    value={hangTrongForm.mo_ta}
                    onChange={(e) => setHangTrongForm({ ...hangTrongForm, mo_ta: e.target.value })}
                    placeholder="Mô tả về hãng tròng..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveHangTrong}>
                    {editingHangTrong ? 'Cập nhật' : 'Thêm mới'}
                  </Button>
                  {editingHangTrong && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingHangTrong(null);
                        setHangTrongForm({ id: 0, ten_hang: '', gia_nhap: '', gia_ban: '', mo_ta: '' });
                      }}
                    >
                      Hủy
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Danh sách hãng tròng */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách hãng tròng ({dsHangTrong.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dsHangTrong.map((hang) => (
                    <div key={hang.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">{hang.ten_hang}</div>
                        <div className="text-sm text-gray-600">
                          Nhập: {(hang.gia_nhap / 1000).toFixed(0)}k | Bán: {(hang.gia_ban / 1000).toFixed(0)}k
                        </div>
                        {hang.mo_ta && <div className="text-xs text-gray-500">{hang.mo_ta}</div>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => editHangTrong(hang)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteHangTrong(hang.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab Gọng kính */}
        {activeTab === 'gong-kinh' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Form thêm/sửa gọng */}
            <Card>
              <CardHeader>
                <CardTitle>{editingGongKinh ? 'Sửa gọng kính' : 'Thêm gọng kính mới'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Tên gọng</label>
                  <Input
                    value={gongKinhForm.ten_gong}
                    onChange={(e) => setGongKinhForm({ ...gongKinhForm, ten_gong: e.target.value })}
                    placeholder="VD: Gọng nhựa cao cấp"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Chất liệu</label>
                  <Input
                    value={gongKinhForm.chat_lieu}
                    onChange={(e) => setGongKinhForm({ ...gongKinhForm, chat_lieu: e.target.value })}
                    placeholder="VD: Nhựa TR90, Kim loại, Titan"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Giá nhập (VNĐ)</label>
                    <Input
                      type="number"
                      value={gongKinhForm.gia_nhap}
                      onChange={(e) => setGongKinhForm({ ...gongKinhForm, gia_nhap: e.target.value })}
                      placeholder="120000"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Giá bán (VNĐ)</label>
                    <Input
                      type="number"
                      value={gongKinhForm.gia_ban}
                      onChange={(e) => setGongKinhForm({ ...gongKinhForm, gia_ban: e.target.value })}
                      placeholder="280000"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Mô tả</label>
                  <Textarea
                    value={gongKinhForm.mo_ta}
                    onChange={(e) => setGongKinhForm({ ...gongKinhForm, mo_ta: e.target.value })}
                    placeholder="Mô tả về gọng kính..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveGongKinh}>
                    {editingGongKinh ? 'Cập nhật' : 'Thêm mới'}
                  </Button>
                  {editingGongKinh && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingGongKinh(null);
                        setGongKinhForm({ id: 0, ten_gong: '', chat_lieu: '', gia_nhap: '', gia_ban: '', mo_ta: '' });
                      }}
                    >
                      Hủy
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Danh sách gọng kính */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách gọng kính ({dsGongKinh.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dsGongKinh.map((gong) => (
                    <div key={gong.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">{gong.ten_gong}</div>
                        <div className="text-sm text-gray-600">
                          {gong.chat_lieu} | Nhập: {(gong.gia_nhap / 1000).toFixed(0)}k | Bán: {(gong.gia_ban / 1000).toFixed(0)}k
                        </div>
                        {gong.mo_ta && <div className="text-xs text-gray-500">{gong.mo_ta}</div>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => editGongKinh(gong)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteGongKinh(gong.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab Mẫu dữ liệu */}
        {activeTab === 'mau-du-lieu' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Mẫu thị lực */}
            <Card>
              <CardHeader>
                <CardTitle>Mẫu thị lực ({dsThiLuc.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Form thêm/sửa thị lực */}
                <div className="border-b pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="VD: 10/10"
                      value={thiLucForm.gia_tri}
                      onChange={(e) => setThiLucForm({ ...thiLucForm, gia_tri: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Thứ tự"
                      value={thiLucForm.thu_tu}
                      onChange={(e) => setThiLucForm({ ...thiLucForm, thu_tu: e.target.value })}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={saveThiLuc}>
                        {editingThiLuc ? 'Sửa' : 'Thêm'}
                      </Button>
                      {editingThiLuc && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingThiLuc(null);
                            setThiLucForm({ gia_tri: '', thu_tu: '' });
                          }}
                        >
                          Hủy
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Danh sách thị lực */}
                <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                  {dsThiLuc.map((item) => (
                    <div key={item.id} className="relative group">
                      <div className="p-2 border rounded text-center text-sm hover:bg-gray-50">
                        {item.gia_tri}
                      </div>
                      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex gap-1">
                        <button
                          className="w-4 h-4 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center"
                          onClick={() => editThiLuc(item)}
                        >
                          ✏
                        </button>
                        <button
                          className="w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                          onClick={() => deleteThiLuc(item.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mẫu số kính */}
            <Card>
              <CardHeader>
                <CardTitle>Mẫu số kính ({dsSoKinh.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Form thêm/sửa số kính */}
                <div className="border-b pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="VD: -2.00"
                      value={soKinhForm.so_kinh}
                      onChange={(e) => setSoKinhForm({ ...soKinhForm, so_kinh: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Thứ tự"
                      value={soKinhForm.thu_tu}
                      onChange={(e) => setSoKinhForm({ ...soKinhForm, thu_tu: e.target.value })}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={saveSoKinh}>
                        {editingSoKinh ? 'Sửa' : 'Thêm'}
                      </Button>
                      {editingSoKinh && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSoKinh(null);
                            setSoKinhForm({ so_kinh: '', thu_tu: '' });
                          }}
                        >
                          Hủy
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Danh sách số kính */}
                <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  {dsSoKinh.map((item) => (
                    <div key={item.id} className="relative group">
                      <div className="p-2 border rounded text-center text-xs hover:bg-gray-50">
                        {item.so_kinh}
                      </div>
                      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex gap-1">
                        <button
                          className="w-3 h-3 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center"
                          onClick={() => editSoKinh(item)}
                        >
                          ✏
                        </button>
                        <button
                          className="w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                          onClick={() => deleteSoKinh(item.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
