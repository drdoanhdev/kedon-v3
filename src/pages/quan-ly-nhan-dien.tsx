import React, { useState, useEffect } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import apiClient from '../lib/apiClient';
import { Toaster, toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import Link from 'next/link';

interface Patient {
  id: number;
  ten: string;
  dienthoai?: string;
}

interface FaceEmbedding {
  id: number;
  patient_id: number;
  patient: Patient;
  created_at: string;
  updated_at: string;
  has_embedding: boolean;
}

export default function QuanLyNhanDienPage() {
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Đặt tiêu đề trang
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Quản lý nhận diện khuôn mặt';
    }
  }, []);

  const fetchEmbeddings = async () => {
    try {
      setRefreshing(true);
      const res = await apiClient.get('/api/face-embeddings');
      if (res.data && res.data.data) {
        setEmbeddings(res.data.data);
      }
    } catch (error) {
      console.error('Lỗi khi tải embeddings:', error);
      toast.error('Không thể tải danh sách nhận diện');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmbeddings();
  }, []);

  const handleDelete = async (patientId: number, patientName: string) => {
    if (!confirm(`Xác nhận xóa nhận diện khuôn mặt của bệnh nhân "${patientName}"?`)) {
      return;
    }

    try {
      await apiClient.delete(`/api/face-embeddings?patient_id=${patientId}`);
      toast.success(`Đã xóa nhận diện của ${patientName}`);
      fetchEmbeddings();
    } catch (error) {
      console.error('Lỗi khi xóa:', error);
      toast.error('Không thể xóa nhận diện');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: vi });
    } catch {
      return dateString;
    }
  };

  // Lọc theo tìm kiếm
  const filteredEmbeddings = embeddings.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.patient.ten.toLowerCase().includes(term) ||
      item.patient.id.toString().includes(term) ||
      item.patient.dienthoai?.toLowerCase().includes(term)
    );
  });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="p-4 lg:p-6">
          <Toaster position="top-right" />

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                🎭 Quản lý nhận diện khuôn mặt
              </h1>
              <p className="text-gray-600">
                Quản lý dữ liệu nhận diện khuôn mặt bệnh nhân
              </p>
            </div>
            <div className="flex gap-2 mt-4 md:mt-0">
              <Button
                onClick={fetchEmbeddings}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {refreshing ? '⏳ Đang tải...' : '🔄 Làm mới'}
              </Button>
              <Link href="/cho-kham">
                <Button variant="outline">⏱️ Danh sách chờ</Button>
              </Link>
            </div>
          </div>

          {/* Thống kê */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tổng số embedding</p>
                    <p className="text-3xl font-bold text-blue-600">{embeddings.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🎭</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tìm kiếm</p>
                    <input
                      type="text"
                      placeholder="Tên, mã BN..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="mt-1 text-sm border-0 border-b-2 border-gray-300 focus:border-blue-500 outline-none w-full"
                    />
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🔍</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Kết quả lọc</p>
                    <p className="text-3xl font-bold text-green-600">{filteredEmbeddings.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">📊</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hướng dẫn upload */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h3 className="font-bold text-blue-900 mb-2">📝 Hướng dẫn thêm nhận diện khuôn mặt:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                <li>Mở terminal tại thư mục <code className="bg-blue-100 px-1 rounded">nhan_dien</code></li>
                <li>Chạy lệnh: <code className="bg-blue-100 px-2 py-1 rounded">python embedding_manager.py</code></li>
                <li>Chọn option 1 (upload từ file) hoặc 2 (chụp từ camera)</li>
                <li>Nhập ID bệnh nhân và làm theo hướng dẫn</li>
                <li>Quay lại trang này và nhấn "Làm mới" để xem kết quả</li>
              </ol>
            </CardContent>
          </Card>

          {/* Danh sách embeddings */}
          <Card>
            <CardContent className="p-0">
              {filteredEmbeddings.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {searchTerm ? (
                    <>
                      <p className="text-4xl mb-4">🔍</p>
                      <p>Không tìm thấy kết quả phù hợp</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl mb-4">🎭</p>
                      <p>Chưa có dữ liệu nhận diện khuôn mặt</p>
                      <p className="text-sm mt-2">Sử dụng embedding_manager.py để thêm</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          STT
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Mã BN
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Tên bệnh nhân
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Điện thoại
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Ngày tạo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Cập nhật
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredEmbeddings.map((item, index) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700">{index + 1}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {item.patient.id}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {item.patient.ten}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.patient.dienthoai || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(item.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(item.updated_at)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(item.patient_id, item.patient.ten)}
                            >
                              🗑️ Xóa
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Thông tin camera service */}
          <Card className="mt-6 bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <h3 className="font-bold text-yellow-900 mb-2">📹 Camera Service:</h3>
              <p className="text-sm text-yellow-800 mb-2">
                Để bật dịch vụ nhận diện tự động:
              </p>
              <code className="block bg-yellow-100 p-3 rounded text-sm">
                cd nhan_dien<br />
                python face_recognition_service.py
              </code>
              <p className="text-xs text-yellow-700 mt-2">
                ⚠️ Đảm bảo đã cấu hình RTSP_URL trong file .env
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
