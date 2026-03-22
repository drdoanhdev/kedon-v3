import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../components/ProtectedRoute';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import toast, { Toaster } from 'react-hot-toast';

interface DonThuocMau {
  id: number;
  ten_mau: string;
  mo_ta: string;
  chuyen_khoa: string;
  chitiet: {
    thuoc: {
      id: number;
      tenthuoc: string;
      donvitinh: string;
      giaban: number;
    };
    soluong: number;
    ghi_chu: string;
  }[];
}

interface Thuoc {
  id: number;
  tenthuoc: string;
  donvitinh: string;
  cachdung: string;
  giaban: number;
}

interface ThuocMau {
  thuocid: number;
  soluong: number;
  ghi_chu: string;
}

export default function DonThuocMauPage() {
  const [dsMau, setDsMau] = useState<DonThuocMau[]>([]);
  const [dsThuoc, setDsThuoc] = useState<Thuoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMau, setEditingMau] = useState<DonThuocMau | null>(null);
  
  // Form states
  const [tenMau, setTenMau] = useState('');
  const [moTa, setMoTa] = useState('');
  const [thuocsMau, setThuocsMau] = useState<ThuocMau[]>([]);
  const [selectedThuocId, setSelectedThuocId] = useState<number | null>(null);
  const [soLuong, setSoLuong] = useState(1);
  const [ghiChu, setGhiChu] = useState('');
  const [timKiemThuoc, setTimKiemThuoc] = useState('');

  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [mauRes, thuocRes] = await Promise.all([
        fetchWithAuth('/api/don-thuoc-mau'),
        fetchWithAuth('/api/thuoc')
      ]);
      
      const [mauData, thuocData] = await Promise.all([
        mauRes.json(),
        thuocRes.json()
      ]);

      if (mauData.data) setDsMau(mauData.data);
      if (thuocData.data) setDsThuoc(thuocData.data);
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu:', error);
      toast.error('Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTenMau('');
    setMoTa('');
    setThuocsMau([]);
    setSelectedThuocId(null);
    setSoLuong(1);
    setGhiChu('');
    setTimKiemThuoc('');
    setEditingMau(null);
  };

  const handleEdit = (mau: DonThuocMau) => {
    setEditingMau(mau);
    setTenMau(mau.ten_mau);
    setMoTa(mau.mo_ta);
    setThuocsMau(mau.chitiet.map(ct => ({
      thuocid: ct.thuoc.id,
      soluong: ct.soluong,
      ghi_chu: ct.ghi_chu
    })));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenMau.trim() || thuocsMau.length === 0) {
      toast.error('Vui lòng nhập tên mẫu và chọn ít nhất một thuốc');
      return;
    }

    try {
      const payload = {
        ten_mau: tenMau,
        mo_ta: moTa,
        thuocs: thuocsMau
      };

      const response = await fetch(
        editingMau ? '/api/don-thuoc-mau' : '/api/don-thuoc-mau',
        {
          method: editingMau ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingMau ? { id: editingMau.id, ...payload } : payload)
        }
      );

      const result = await response.json();

      if (response.ok) {
        toast.success(result.message);
        setShowForm(false);
        resetForm();
        fetchData();
      } else {
        toast.error(result.message || 'Có lỗi xảy ra');
      }
    } catch (error) {
      console.error('Lỗi:', error);
      toast.error('Lỗi khi lưu đơn thuốc mẫu');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đơn thuốc mẫu này?')) return;

    try {
      const response = await fetch(`/api/don-thuoc-mau?id=${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(result.message);
        fetchData();
      } else {
        toast.error(result.message || 'Có lỗi xảy ra');
      }
    } catch (error) {
      console.error('Lỗi:', error);
      toast.error('Lỗi khi xóa đơn thuốc mẫu');
    }
  };

  const removeThuocFromMau = (thuocid: number) => {
    setThuocsMau(thuocsMau.filter(t => t.thuocid !== thuocid));
  };

  const getThuocInfo = (thuocid: number) => {
    return dsThuoc.find(t => t.id === thuocid);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="p-4">
          <Toaster position="top-right" />
          <div className="text-center">Đang tải...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="p-4 space-y-4">
        <Toaster position="top-right" />
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Quản lý đơn thuốc mẫu</h1>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setShowForm(true); }}>
                Tạo đơn thuốc mẫu
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingMau ? 'Chỉnh sửa đơn thuốc mẫu' : 'Tạo đơn thuốc mẫu mới'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tenMau">Tên mẫu *</Label>
                    <Input
                      id="tenMau"
                      value={tenMau}
                      onChange={(e) => setTenMau(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="moTa">Mô tả</Label>
                  <Textarea
                    id="moTa"
                    value={moTa}
                    onChange={(e) => setMoTa(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Danh sách thuốc</h3>
                  
                  {/* Tìm kiếm và chọn thuốc */}
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Tìm kiếm thuốc</Label>
                        <Input
                          placeholder="Nhập tên thuốc để tìm kiếm..."
                          value={timKiemThuoc}
                          onChange={(e) => setTimKiemThuoc(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label>Số lượng</Label>
                          <Input
                            type="number"
                            value={soLuong}
                            onChange={(e) => setSoLuong(Number(e.target.value))}
                            min="1"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label>Ghi chú</Label>
                          <Input
                            placeholder="Ghi chú (tùy chọn)"
                            value={ghiChu}
                            onChange={(e) => setGhiChu(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Danh sách thuốc để chọn */}
                    {timKiemThuoc && (
                      <div className="border rounded-md max-h-40 overflow-y-auto">
                        {dsThuoc
                          .filter(thuoc => 
                            thuoc.tenthuoc.toLowerCase().includes(timKiemThuoc.toLowerCase())
                          )
                          .slice(0, 10)
                          .map((thuoc) => (
                            <div
                              key={thuoc.id}
                              className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                              onClick={() => {
                                if (soLuong <= 0) {
                                  toast.error('Vui lòng nhập số lượng hợp lệ');
                                  return;
                                }
                                
                                // Check if drug already exists
                                if (thuocsMau.some(t => t.thuocid === thuoc.id)) {
                                  toast.error('Thuốc này đã có trong danh sách');
                                  return;
                                }

                                setThuocsMau([...thuocsMau, {
                                  thuocid: thuoc.id,
                                  soluong: soLuong,
                                  ghi_chu: ghiChu
                                }]);

                                setTimKiemThuoc('');
                                setSoLuong(1);
                                setGhiChu('');
                                toast.success(`Đã thêm ${thuoc.tenthuoc}`);
                              }}
                            >
                              <div className="font-medium">{thuoc.tenthuoc}</div>
                              <div className="text-xs text-gray-500">
                                {thuoc.donvitinh} • {thuoc.giaban.toLocaleString()}đ
                              </div>
                            </div>
                          ))
                        }
                        {dsThuoc.filter(thuoc => 
                          thuoc.tenthuoc.toLowerCase().includes(timKiemThuoc.toLowerCase())
                        ).length === 0 && (
                          <div className="p-3 text-center text-gray-500">
                            Không tìm thấy thuốc nào
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {thuocsMau.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tên thuốc</TableHead>
                          <TableHead>Số lượng</TableHead>
                          <TableHead>Đơn vị</TableHead>
                          <TableHead>Ghi chú</TableHead>
                          <TableHead>Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {thuocsMau.map((thuocMau) => {
                          const thuocInfo = getThuocInfo(thuocMau.thuocid);
                          return (
                            <TableRow key={thuocMau.thuocid}>
                              <TableCell>{thuocInfo?.tenthuoc}</TableCell>
                              <TableCell>{thuocMau.soluong}</TableCell>
                              <TableCell>{thuocInfo?.donvitinh}</TableCell>
                              <TableCell>{thuocMau.ghi_chu}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => removeThuocFromMau(thuocMau.thuocid)}
                                >
                                  Xóa
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Hủy
                  </Button>
                  <Button type="submit">
                    {editingMau ? 'Cập nhật' : 'Tạo mẫu'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách đơn thuốc mẫu</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên mẫu</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Số thuốc</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dsMau.map((mau) => (
                  <TableRow key={mau.id}>
                    <TableCell className="font-medium">{mau.ten_mau}</TableCell>
                    <TableCell>{mau.mo_ta}</TableCell>
                    <TableCell>{mau.chitiet?.length || 0}</TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(mau)}
                      >
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(mau.id)}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
