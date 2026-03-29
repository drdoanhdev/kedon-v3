/**
 * Trang quản lý Pending Faces - Khuôn mặt chưa gán bệnh nhân
 */

import { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UserPlus,
  XCircle,
  RefreshCw,
  Search,
  Camera,
  Clock,
  Trash2,
  CheckCircle,
  AlertCircle,
  Users,
  X,
  Plus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

// =============================================
// INTERFACES - Phù hợp với bảng PendingFaces
// =============================================

interface PendingFace {
  id: number;
  pending_code: string;
  avatar: string | null;
  embedding?: number[];
  camera_id: string;
  camera_location: string | null;
  quality_score: number;
  capture_count: number;
  similarity_to_nearest: number;
  detected_at: string;
  status: 'pending' | 'assigned' | 'rejected';
  assigned_to: number | null;  // Đổi từ assigned_patient_id
  assigned_at: string | null;
  reject_reason: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  // Join với BenhNhan khi assigned
  benh_nhan?: {
    id: number;
    ten: string;
  } | null;
}

interface Patient {
  id: number;
  ten: string;
  dienthoai?: string;
  namsinh?: string;
  diachi?: string;
}

interface Stats {
  pending: number;
  assigned: number;
  rejected: number;
  total: number;
}

// =============================================
// CONSTANTS
// =============================================

const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5555';

// =============================================
// HELPER FUNCTIONS
// =============================================

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge className="bg-orange-100 text-orange-700">Chờ xử lý</Badge>;
    case 'assigned':
      return <Badge className="bg-green-100 text-green-700">Đã gán</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700">Từ chối</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-700">{status}</Badge>;
  }
};

const getQualityColor = (score: number) => {
  if (score >= 0.8) return 'bg-green-500';
  if (score >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getQualityLabel = (score: number) => {
  if (score >= 0.8) return 'Tốt';
  if (score >= 0.6) return 'Trung bình';
  return 'Kém';
};

// =============================================
// MAIN COMPONENT
// =============================================

export default function PendingFacesPage() {
  const { confirm } = useConfirm();
  // Data states
  const [pendingFaces, setPendingFaces] = useState<PendingFace[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, assigned: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  
  // Filter states
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'rejected'>('pending');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'quality'>('newest');
  
  // Assign dialog states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPending, setSelectedPending] = useState<PendingFace | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  
  // Reject dialog states
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  
  // View dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedFace, setSelectedFace] = useState<PendingFace | null>(null);
  
  // Create patient dialog
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    ten: '',
    dienthoai: '',
    namsinh: '',
    diachi: '',
  });
  const [creating, setCreating] = useState(false);

  // =============================================
  // API CALLS
  // =============================================

  // Fetch pending faces với retry logic
  const fetchPendingFaces = useCallback(async (retryCount = 0) => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      params.append('sort', sortBy);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(`${PYTHON_API}/api/pending-faces?${params}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (data.success) {
        setPendingFaces(data.data || []);
        setServerOnline(true);
      } else {
        console.error('Error fetching pending faces:', data.error);
        setServerOnline(true); // Server responded but with error
      }
    } catch (error: unknown) {
      // Retry 1 lần nếu lỗi network
      if (retryCount < 1 && error instanceof Error && error.name !== 'AbortError') {
        console.log('Retrying fetchPendingFaces...');
        setTimeout(() => fetchPendingFaces(retryCount + 1), 1000);
        return;
      }
      console.error('Error fetching pending faces:', error);
      setServerOnline(false);
    }
  }, [filterStatus, sortBy]);

  // Fetch stats với retry logic
  const fetchStats = useCallback(async (retryCount = 0) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(`${PYTHON_API}/api/pending-faces/stats`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
        setServerOnline(true);
      }
    } catch (error: unknown) {
      // Retry 1 lần nếu lỗi network
      if (retryCount < 1 && error instanceof Error && error.name !== 'AbortError') {
        console.log('Retrying fetchStats...');
        setTimeout(() => fetchStats(retryCount + 1), 1000);
        return;
      }
      console.error('Error fetching stats:', error);
      setServerOnline(false);
    }
  }, []);

  // Initial load & auto refresh
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPendingFaces(), fetchStats()]);
      setLoading(false);
    };
    
    loadData();
    
    // Auto refresh mỗi 30 giây
    const interval = setInterval(() => {
      fetchPendingFaces();
      fetchStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchPendingFaces, fetchStats]);

  // Refetch khi filter/sort thay đổi
  useEffect(() => {
    if (!loading) {
      fetchPendingFaces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, sortBy]);

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPendingFaces(), fetchStats()]);
    setRefreshing(false);
    toast.success('Đã làm mới danh sách');
  };

  // =============================================
  // SEARCH PATIENTS
  // =============================================

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setSearching(true);
        try {
          const timestamp = Date.now();
          const response = await fetch(
            `/api/benh-nhan?search=${encodeURIComponent(searchQuery)}&pageSize=10&_t=${timestamp}`,
            {
              headers: {
                'Cache-Control': 'no-cache',
              },
            }
          );
          const data = await response.json();
          
          if (data.data) {
            setSearchResults(data.data);
          }
        } catch (error) {
          console.error('Error searching patients:', error);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // =============================================
  // ASSIGN PATIENT
  // =============================================

  const openAssignDialog = (pending: PendingFace) => {
    setSelectedPending(pending);
    setSelectedPatient(null);
    setSearchQuery('');
    setSearchResults([]);
    setAssignDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedPending || !selectedPatient) return;
    
    setAssigning(true);
    try {
      const response = await fetch(`${PYTHON_API}/api/pending-faces/${selectedPending.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: selectedPatient.id }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Đã gán khuôn mặt cho ${selectedPatient.ten}`);
        setAssignDialogOpen(false);
        await Promise.all([fetchPendingFaces(), fetchStats()]);
      } else {
        toast.error(data.error || 'Không thể gán khuôn mặt');
      }
    } catch (error) {
      console.error('Error assigning:', error);
      toast.error('Lỗi kết nối server');
    } finally {
      setAssigning(false);
    }
  };

  // =============================================
  // CREATE NEW PATIENT & ASSIGN
  // =============================================

  const handleCreateAndAssign = async () => {
    if (!selectedPending || !newPatient.ten.trim()) {
      toast.error('Vui lòng nhập tên bệnh nhân');
      return;
    }
    
    setCreating(true);
    try {
      // 1. Tạo bệnh nhân mới
      const createRes = await fetchWithAuth('/api/benh-nhan', {
        method: 'POST',
        body: JSON.stringify({
          ten: newPatient.ten.trim(),
          dienthoai: newPatient.dienthoai.trim() || null,
          namsinh: newPatient.namsinh.trim() || null,
          diachi: newPatient.diachi.trim() || null,
        }),
      });
      
      const createData = await createRes.json();
      
      if (!createRes.ok || !createData.data?.id) {
        toast.error(createData.message || 'Không thể tạo bệnh nhân');
        return;
      }
      
      const newPatientId = createData.data.id;
      
      // 2. Gán khuôn mặt cho bệnh nhân vừa tạo
      const assignRes = await fetch(`${PYTHON_API}/api/pending-faces/${selectedPending.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: newPatientId }),
      });
      
      const assignData = await assignRes.json();
      
      if (assignData.success) {
        toast.success(`Đã tạo và gán cho bệnh nhân ${newPatient.ten}`);
        setCreatePatientOpen(false);
        setAssignDialogOpen(false);
        setNewPatient({ ten: '', dienthoai: '', namsinh: '', diachi: '' });
        await Promise.all([fetchPendingFaces(), fetchStats()]);
      } else {
        toast.error('Đã tạo bệnh nhân nhưng không thể gán khuôn mặt');
      }
    } catch (error) {
      console.error('Error creating patient:', error);
      toast.error('Lỗi tạo bệnh nhân');
    } finally {
      setCreating(false);
    }
  };

  // =============================================
  // REJECT PENDING FACE
  // =============================================

  const openRejectDialog = (pending: PendingFace) => {
    setSelectedPending(pending);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedPending) return;
    
    setRejecting(true);
    try {
      const response = await fetch(`${PYTHON_API}/api/pending-faces/${selectedPending.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Đã từ chối khuôn mặt');
        setRejectDialogOpen(false);
        await Promise.all([fetchPendingFaces(), fetchStats()]);
      } else {
        toast.error(data.error || 'Không thể từ chối');
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      toast.error('Lỗi kết nối server');
    } finally {
      setRejecting(false);
    }
  };

  // =============================================
  // VIEW DETAIL
  // =============================================

  const openViewDialog = (face: PendingFace) => {
    setSelectedFace(face);
    setViewDialogOpen(true);
  };

  // =============================================
  // CLEANUP OLD DATA
  // =============================================

  const handleCleanup = async () => {
    if (!await confirm('Xóa tất cả pending faces cũ hơn 7 ngày?')) return;
    
    try {
      const response = await fetch(`${PYTHON_API}/api/pending-faces/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Đã xóa ${data.deleted || 0} pending faces cũ`);
        await Promise.all([fetchPendingFaces(), fetchStats()]);
      } else {
        toast.error(data.error || 'Không thể xóa');
      }
    } catch (error) {
      console.error('Error cleanup:', error);
      toast.error('Lỗi xóa dữ liệu cũ');
    }
  };

  // =============================================
  // RENDER
  // =============================================

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex items-center justify-center min-h-screen">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2">Đang tải...</span>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-4 lg:p-6 space-y-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-7 w-7 text-blue-600" />
                Khuôn mặt chờ xử lý
              </h1>
              <p className="text-gray-500 mt-1">
                Gán bệnh nhân cho các khuôn mặt được phát hiện tự động
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Server Status Badge */}
              <Badge 
                variant={serverOnline ? "default" : "destructive"}
                className="px-3 py-1"
              >
                {serverOnline ? (
                  <><Wifi className="h-4 w-4 mr-1" /> Server Online</>
                ) : (
                  <><WifiOff className="h-4 w-4 mr-1" /> Server Offline</>
                )}
              </Badge>
              
              <Button variant="outline" size="sm" onClick={handleCleanup} disabled={!serverOnline}>
                <Trash2 className="h-4 w-4 mr-2" />
                Dọn dẹp
              </Button>
              <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>
          </div>

          {/* Server Offline Card */}
          {!serverOnline && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-8 text-center">
                <WifiOff className="h-16 w-16 mx-auto text-red-400 mb-4" />
                <h3 className="text-lg font-semibold text-red-700">
                  Không thể kết nối đến Server Nhận diện
                </h3>
                <p className="text-red-600 mt-2">
                  Đảm bảo server Python đang chạy tại <code className="bg-red-100 px-2 py-1 rounded">{PYTHON_API}</code>
                </p>
                <pre className="mt-4 bg-gray-800 text-green-400 p-4 rounded text-left text-sm max-w-md mx-auto">
{`cd C:\\KEDON\\nhan_dien
.\\venv\\Scripts\\activate
python main.py`}
                </pre>
                <Button 
                  className="mt-4" 
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Thử kết nối lại
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards - chỉ hiện khi server online */}
          {serverOnline && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card 
              className={`cursor-pointer transition-all ${filterStatus === 'pending' ? 'ring-2 ring-orange-500' : ''}`}
              onClick={() => setFilterStatus('pending')}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Chờ xử lý</p>
                    <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer transition-all ${filterStatus === 'assigned' ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => setFilterStatus('assigned')}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Đã gán</p>
                    <p className="text-2xl font-bold text-green-500">{stats.assigned}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer transition-all ${filterStatus === 'rejected' ? 'ring-2 ring-red-500' : ''}`}
              onClick={() => setFilterStatus('rejected')}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Từ chối</p>
                    <p className="text-2xl font-bold text-red-500">{stats.rejected}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer transition-all ${filterStatus === 'all' ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Tổng cộng</p>
                    <p className="text-2xl font-bold text-blue-500">{stats.total}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {/* Filter & Sort - chỉ hiện khi server online */}
          {serverOnline && (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-gray-500">Sắp xếp:</span>
            <div className="flex gap-2">
              <Button 
                variant={sortBy === 'newest' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSortBy('newest')}
              >
                Mới nhất
              </Button>
              <Button 
                variant={sortBy === 'oldest' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSortBy('oldest')}
              >
                Cũ nhất
              </Button>
              <Button 
                variant={sortBy === 'quality' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSortBy('quality')}
              >
                Chất lượng
              </Button>
            </div>
          </div>
          )}

          {/* Pending Faces Grid - chỉ hiện khi server online */}
          {serverOnline && (
            <>
              {pendingFaces.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <Users className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">
                      {filterStatus === 'pending' 
                        ? 'Không có khuôn mặt nào chờ xử lý'
                        : filterStatus === 'all'
                        ? 'Chưa có khuôn mặt nào được ghi nhận'
                        : `Không có khuôn mặt nào với trạng thái "${filterStatus}"`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {pendingFaces.map((face) => (
                    <Card 
                      key={face.id} 
                      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => openViewDialog(face)}
                    >
                      {/* Avatar */}
                      <div className="aspect-square relative bg-gray-100">
                        {face.avatar ? (
                          <img
                            src={face.avatar.startsWith('data:') ? face.avatar : `data:image/jpeg;base64,${face.avatar}`}
                            alt={`Pending #${face.id}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Users className="h-12 w-12 text-gray-300" />
                          </div>
                        )}
                        
                        {/* Status badge */}
                        <div className="absolute top-2 left-2">
                          {getStatusBadge(face.status)}
                        </div>
                        
                        {/* Quality indicator */}
                        <div className="absolute top-2 right-2">
                          <div 
                            className={`w-3 h-3 rounded-full ${getQualityColor(face.quality_score)}`} 
                            title={`Chất lượng: ${getQualityLabel(face.quality_score)}`} 
                          />
                        </div>
                      </div>
                      
                      {/* Info */}
                      <CardContent className="p-2 space-y-1">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Camera className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{face.camera_location || face.camera_id}</span>
                        </div>
                        
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>{formatTime(face.detected_at)}</span>
                        </div>
                        
                        {/* Hiển thị tên bệnh nhân nếu đã assigned */}
                        {face.status === 'assigned' && face.benh_nhan && (
                          <div className="text-xs text-green-600 font-medium truncate">
                            → {face.benh_nhan.ten}
                          </div>
                        )}
                        
                        {/* Actions - chỉ hiển thị cho pending */}
                        {face.status === 'pending' && (
                          <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => openAssignDialog(face)}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Gán
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2"
                              onClick={() => openRejectDialog(face)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* =============================================
              ASSIGN DIALOG
              ============================================= */}
          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Gán bệnh nhân cho khuôn mặt</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Preview */}
                {selectedPending && (
                  <div className="flex gap-4 p-3 bg-gray-50 rounded-lg">
                    <img
                      src={selectedPending.avatar?.startsWith('data:') 
                        ? selectedPending.avatar 
                        : `data:image/jpeg;base64,${selectedPending.avatar}`}
                      alt="Preview"
                      className="w-20 h-20 rounded-lg object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{selectedPending.pending_code}</p>
                      <p className="text-sm text-gray-500">
                        <Camera className="h-3 w-3 inline mr-1" />
                        {selectedPending.camera_location || selectedPending.camera_id}
                      </p>
                      <p className="text-sm text-gray-500">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {formatTime(selectedPending.detected_at)}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Selected patient preview */}
                {selectedPatient && (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div className="flex-1">
                      <p className="font-medium text-green-800">{selectedPatient.ten}</p>
                      <p className="text-sm text-green-600">
                        Mã BN: {selectedPatient.id} | {selectedPatient.dienthoai || 'Không có SĐT'}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedPatient(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Search input */}
                {!selectedPatient && (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Tìm bệnh nhân (tên, SĐT, mã BN)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        autoFocus
                      />
                    </div>
                    
                    {/* Search Results */}
                    {searching && (
                      <div className="text-center py-4 text-gray-500">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto" />
                        <span className="text-sm">Đang tìm...</span>
                      </div>
                    )}
                    
                    {searchResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                        {searchResults.map((patient) => (
                          <div
                            key={patient.id}
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => {
                              setSelectedPatient(patient);
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                          >
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-medium">
                                {patient.ten.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{patient.ten}</p>
                              <p className="text-sm text-gray-500 truncate">
                                Mã BN: {patient.id} | {patient.dienthoai || 'Không có SĐT'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500 mb-2">Không tìm thấy bệnh nhân</p>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setCreatePatientOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Tạo bệnh nhân mới
                        </Button>
                      </div>
                    )}
                    
                    {/* Create new patient button */}
                    {searchQuery.length < 2 && (
                      <div className="text-center">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setCreatePatientOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Tạo bệnh nhân mới
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                  Hủy
                </Button>
                <Button 
                  onClick={handleAssign} 
                  disabled={!selectedPatient || assigning}
                >
                  {assigning ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Xác nhận gán
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* =============================================
              CREATE PATIENT DIALOG
              ============================================= */}
          <Dialog open={createPatientOpen} onOpenChange={setCreatePatientOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tạo bệnh nhân mới</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Họ và tên <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Nhập họ và tên"
                    value={newPatient.ten}
                    onChange={(e) => setNewPatient({ ...newPatient, ten: e.target.value })}
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Số điện thoại</label>
                  <Input
                    placeholder="Nhập số điện thoại"
                    value={newPatient.dienthoai}
                    onChange={(e) => setNewPatient({ ...newPatient, dienthoai: e.target.value })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Năm sinh</label>
                  <Input
                    placeholder="VD: 1990 hoặc 01/01/1990"
                    value={newPatient.namsinh}
                    onChange={(e) => setNewPatient({ ...newPatient, namsinh: e.target.value })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Địa chỉ</label>
                  <Input
                    placeholder="Nhập địa chỉ"
                    value={newPatient.diachi}
                    onChange={(e) => setNewPatient({ ...newPatient, diachi: e.target.value })}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreatePatientOpen(false)}>
                  Hủy
                </Button>
                <Button 
                  onClick={handleCreateAndAssign} 
                  disabled={!newPatient.ten.trim() || creating}
                >
                  {creating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Tạo và gán
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* =============================================
              REJECT DIALOG
              ============================================= */}
          <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Từ chối khuôn mặt</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {selectedPending && (
                  <div className="flex gap-4 p-3 bg-gray-50 rounded-lg">
                    <img
                      src={selectedPending.avatar?.startsWith('data:') 
                        ? selectedPending.avatar 
                        : `data:image/jpeg;base64,${selectedPending.avatar}`}
                      alt="Face"
                      className="w-16 h-16 object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                      }}
                    />
                    <div>
                      <p className="font-medium">{selectedPending.pending_code}</p>
                      <p className="text-sm text-gray-500">
                        {selectedPending.camera_location || selectedPending.camera_id}
                      </p>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Lý do từ chối (tùy chọn)</label>
                  <Input
                    placeholder="Ví dụ: Ảnh mờ, không phải bệnh nhân..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                  Hủy
                </Button>
                <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
                  {rejecting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Từ chối
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* =============================================
              VIEW DETAIL DIALOG
              ============================================= */}
          <Dialog open={viewDialogOpen} onOpenChange={(open) => {
            setViewDialogOpen(open);
            if (!open) setSelectedFace(null);
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Chi tiết khuôn mặt</DialogTitle>
              </DialogHeader>
              
              {selectedFace && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Large Avatar */}
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    {selectedFace.avatar ? (
                      <img
                        src={selectedFace.avatar.startsWith('data:') 
                          ? selectedFace.avatar 
                          : `data:image/jpeg;base64,${selectedFace.avatar}`}
                        alt="Face"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users className="h-16 w-16 text-gray-300" />
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-500">Mã pending</label>
                      <p className="font-medium">{selectedFace.pending_code}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-500">Trạng thái</label>
                      <div className="mt-1">{getStatusBadge(selectedFace.status)}</div>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-500">Camera</label>
                      <p className="font-medium">
                        {selectedFace.camera_location || selectedFace.camera_id}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-500">Thời gian phát hiện</label>
                      <p className="font-medium">{formatDate(selectedFace.detected_at)}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-500">Chất lượng ảnh</label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${getQualityColor(selectedFace.quality_score)}`}
                            style={{ width: `${selectedFace.quality_score * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {(selectedFace.quality_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    
                    {selectedFace.capture_count > 0 && (
                      <div>
                        <label className="text-sm text-gray-500">Số lần capture</label>
                        <p className="font-medium">{selectedFace.capture_count} ảnh</p>
                      </div>
                    )}
                    
                    {selectedFace.similarity_to_nearest > 0 && (
                      <div>
                        <label className="text-sm text-gray-500">Độ tương tự gần nhất</label>
                        <p className="font-medium text-orange-500">
                          {(selectedFace.similarity_to_nearest * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    
                    {/* Hiển thị bệnh nhân đã gán */}
                    {selectedFace.status === 'assigned' && selectedFace.benh_nhan && (
                      <div>
                        <label className="text-sm text-gray-500">Đã gán cho</label>
                        <p className="font-medium text-green-600">
                          {selectedFace.benh_nhan.ten} (Mã BN: {selectedFace.benh_nhan.id})
                        </p>
                        <p className="text-xs text-gray-400">
                          Lúc: {formatDate(selectedFace.assigned_at)}
                        </p>
                      </div>
                    )}
                    
                    {selectedFace.reject_reason && (
                      <div>
                        <label className="text-sm text-gray-500">Lý do từ chối</label>
                        <p className="font-medium text-red-500">{selectedFace.reject_reason}</p>
                      </div>
                    )}
                    
                    {/* Actions cho pending */}
                    {selectedFace.status === 'pending' && (
                      <div className="flex gap-2 pt-4">
                        <Button 
                          className="flex-1" 
                          onClick={() => {
                            setViewDialogOpen(false);
                            setTimeout(() => openAssignDialog(selectedFace), 100);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Gán bệnh nhân
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={() => {
                            setViewDialogOpen(false);
                            setTimeout(() => openRejectDialog(selectedFace), 100);
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Từ chối
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </ProtectedRoute>
  );
}