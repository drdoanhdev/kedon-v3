import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'react-hot-toast';
import { 
  Camera, 
  Video, 
  VideoOff, 
  UserPlus, 
  RefreshCw, 
  Clock,
  XCircle,
  Loader2,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import apiClient from '../lib/apiClient';

// Config cho Python Face Recognition Server
const FACE_API_URL = process.env.NEXT_PUBLIC_FACE_API_URL || 'http://localhost:5555';

interface CameraStatus {
  name: string;
  location: string;
  connected: boolean;
  alive: boolean;
  fps: number;
  state: 'idle' | 'recognizing' | 'enrolling';
  enrollment: {
    active: boolean;
    patient_id: number | null;
    captured: number;
    required: number;
  } | null;
}

interface BenhNhan {
  id: number;
  ten: string;
  dienthoai?: string;
}

export default function CameraControl() {
  const [cameras, setCameras] = useState<Record<string, CameraStatus>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  
  // Enrollment dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [searchPatient, setSearchPatient] = useState('');
  const [searchResults, setSearchResults] = useState<BenhNhan[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<BenhNhan | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // Live stream dialog
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [streamCamera, setStreamCamera] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0); // Force refresh stream
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);

  // Reset form when dialog closes
  const handleDialogChange = (open: boolean) => {
    setEnrollDialogOpen(open);
    if (!open) {
      setSearchPatient('');
      setSearchResults([]);
      setSelectedPatient(null);
      setSelectedCamera(null);
    }
  };
  
  // Open stream dialog
  const openStreamDialog = (cameraId: string) => {
    setStreamCamera(cameraId);
    setStreamKey(prev => prev + 1);
    setStreamError(false);
    setSnapshotUrl(null);
    setStreamDialogOpen(true);
  };
  
  // Polling snapshot khi stream dialog mở
  useEffect(() => {
    if (!streamDialogOpen || !streamCamera || !serverOnline) {
      setSnapshotUrl(null);
      return;
    }
    
    let mounted = true;
    
    const fetchSnapshot = async () => {
      try {
        const timestamp = Date.now();
        const url = `${FACE_API_URL}/api/camera/${streamCamera}/snapshot?width=800&faces=true&quality=80&t=${timestamp}`;
        
        // Preload image
        const img = new Image();
        img.onload = () => {
          if (mounted) {
            setSnapshotUrl(url);
            setStreamError(false);
          }
        };
        img.onerror = () => {
          if (mounted) {
            setStreamError(true);
          }
        };
        img.src = url;
      } catch (error) {
        if (mounted) {
          setStreamError(true);
        }
      }
    };
    
    // Fetch ngay lập tức
    fetchSnapshot();
    
    // Polling mỗi 200ms (5 FPS)
    const interval = setInterval(fetchSnapshot, 200);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [streamDialogOpen, streamCamera, serverOnline, streamKey]);

  // Đặt tiêu đề trang
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Điều khiển Camera - Nhận diện';
    }
  }, []);

  // Fetch camera status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${FACE_API_URL}/api/status`);
      if (response.ok) {
        const data = await response.json();
        setCameras(data.cameras || {});
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (error) {
      setServerOnline(false);
      setCameras({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto refresh every 2 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Search patients with debounce
  const handleSearchPatient = async (query: string) => {
    setSearchPatient(query);
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const response = await apiClient.get(`/api/benh-nhan?search=${encodeURIComponent(query)}&pageSize=10`);
      // API trả về { data: [...], total: ... } không có success field
      if (response.data && response.data.data) {
        setSearchResults(response.data.data || []);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Lỗi tìm kiếm bệnh nhân');
    } finally {
      setSearching(false);
    }
  };

  // Start enrollment
  const handleStartEnrollment = async () => {
    if (!selectedPatient) {
      toast.error('Vui lòng chọn bệnh nhân trước');
      return;
    }
    
    setEnrolling(true);
    try {
      const response = await fetch(`${FACE_API_URL}/api/enrollment/start`, {  // Sửa: enroll -> enrollment
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: selectedCamera,
          patient_id: selectedPatient.id
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Bắt đầu đăng ký cho ${selectedPatient.ten}. Yêu cầu bệnh nhân nhìn vào camera!`, {
          duration: 5000,
          icon: '📸'
        });
        handleDialogChange(false); // Reset form and close dialog
      } else {
        toast.error(data.error || 'Không thể bắt đầu đăng ký');
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      toast.error('Lỗi kết nối đến server nhận diện. Đảm bảo Python server đang chạy!');
    } finally {
      setEnrolling(false);
    }
  };

  // Cancel enrollment
  const handleCancelEnrollment = async () => {
    try {
      await fetch(`${FACE_API_URL}/api/enrollment/cancel`, {  // Sửa: enroll -> enrollment
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_id: selectedCamera })
      });
      toast.success('Đã hủy đăng ký');
    } catch (error) {
      toast.error('Lỗi khi hủy đăng ký');
    }
  };

  // Reload embeddings
  const handleReloadEmbeddings = async () => {
    try {
      const response = await fetch(`${FACE_API_URL}/api/embeddings/reload`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Đã reload ${data.count} embeddings`);
      }
    } catch (error) {
      toast.error('Lỗi khi reload embeddings');
    }
  };

  // Clear cooldown
  const handleClearCooldown = async () => {
    try {
      const response = await fetch(`${FACE_API_URL}/api/cooldown/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Đã xóa tất cả cooldown');
      }
    } catch (error) {
      toast.error('Lỗi khi xóa cooldown');
    }
  };

  const openEnrollDialog = (cameraId: string) => {
    setSelectedCamera(cameraId);
    setEnrollDialogOpen(true);
  };

  const getCameraStateColor = (state: string) => {
    switch (state) {
      case 'recognizing': return 'bg-green-500';
      case 'enrolling': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getCameraStateText = (state: string) => {
    switch (state) {
      case 'recognizing': return 'Đang nhận diện';
      case 'enrolling': return 'Đang đăng ký';
      default: return 'Chờ';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Camera className="h-7 w-7" />
              Điều khiển Camera
            </h1>
            <p className="text-gray-500 mt-1">
              Theo dõi camera và đăng ký khuôn mặt bệnh nhân
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Server Status */}
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

            {/* Actions */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => { setRefreshing(true); fetchStatus(); }}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleReloadEmbeddings}>
              <Users className="h-4 w-4 mr-2" />
              Reload Embeddings
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleClearCooldown}>
              <Clock className="h-4 w-4 mr-2" />
              Xóa Cooldown
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}

        {/* No Server */}
        {!loading && !serverOnline && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-8 text-center">
              <WifiOff className="h-16 w-16 mx-auto text-red-400 mb-4" />
              <h3 className="text-lg font-semibold text-red-700">
                Không thể kết nối đến Server Nhận diện
              </h3>
              <p className="text-red-600 mt-2">
                Đảm bảo server Python đang chạy tại <code className="bg-red-100 px-2 py-1 rounded">{FACE_API_URL}</code>
              </p>
              <pre className="mt-4 bg-gray-800 text-green-400 p-4 rounded text-left text-sm max-w-md mx-auto">
{`cd C:\\KEDON\\nhan_dien
.\\venv\\Scripts\\activate
python main.py`}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Camera Grid */}
        {!loading && serverOnline && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(cameras).map(([cameraId, camera]) => (
              <Card key={cameraId} className={`relative overflow-hidden ${!camera.connected ? 'opacity-60' : ''}`}>
                {/* Status indicator */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${getCameraStateColor(camera.state)}`} />
                
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {camera.connected ? (
                        <Video className="h-5 w-5 text-green-500" />
                      ) : (
                        <VideoOff className="h-5 w-5 text-red-500" />
                      )}
                      {camera.name}
                    </CardTitle>
                    <Badge variant={camera.connected ? "default" : "secondary"}>
                      {cameraId}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">{camera.location}</p>
                </CardHeader>
                
                <CardContent>
                  {/* Status Info */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Trạng thái</p>
                      <p className="font-medium flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${getCameraStateColor(camera.state)}`} />
                        {getCameraStateText(camera.state)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">FPS</p>
                      <p className="font-medium">{camera.fps.toFixed(1)}</p>
                    </div>
                  </div>

                  {/* Enrollment Progress */}
                  {camera.enrollment?.active && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-yellow-800">
                          Đang đăng ký...
                        </span>
                        <span className="text-sm text-yellow-600">
                          {camera.enrollment.captured}/{camera.enrollment.required}
                        </span>
                      </div>
                      <div className="w-full bg-yellow-200 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${(camera.enrollment.captured / camera.enrollment.required) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {camera.state === 'enrolling' ? (
                      <Button 
                        variant="destructive" 
                        className="flex-1"
                        onClick={() => handleCancelEnrollment(cameraId)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Hủy đăng ký
                      </Button>
                    ) : (
                      <Button 
                        className="flex-1"
                        onClick={() => openEnrollDialog(cameraId)}
                        disabled={!camera.connected}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Đăng ký
                      </Button>
                    )}
                    <Button 
                      variant="outline"
                      onClick={() => openStreamDialog(cameraId)}
                      disabled={!camera.connected}
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* No cameras */}
            {Object.keys(cameras).length === 0 && (
              <Card className="col-span-full">
                <CardContent className="p-8 text-center text-gray-500">
                  <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có camera nào được kết nối</p>
                  <p className="text-sm mt-1">Kiểm tra cấu hình RTSP_URL trong file .env</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Enrollment Dialog */}
        <Dialog open={enrollDialogOpen} onOpenChange={handleDialogChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Đăng ký khuôn mặt
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label>Camera</Label>
                <Input value={cameras[selectedCamera || '']?.name || selectedCamera || ''} disabled />
              </div>
              
              <div>
                <Label>Tìm bệnh nhân</Label>
                <div className="relative">
                  <Input 
                    placeholder="Nhập tên, mã BN hoặc SĐT..."
                    value={searchPatient}
                    onChange={(e) => handleSearchPatient(e.target.value)}
                  />
                  {searching && (
                    <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && !selectedPatient && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {searchResults.map((patient) => (
                    <div
                      key={patient.id}
                      className={`p-3 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${
                        selectedPatient?.id === patient.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedPatient(patient)}
                    >
                      <p className="font-medium">{patient.ten}</p>
                      <p className="text-sm text-gray-500">
                        Mã BN: {patient.id} • {patient.dienthoai || 'Không có SĐT'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* No results */}
              {searchPatient.length >= 2 && searchResults.length === 0 && !searching && !selectedPatient && (
                <p className="text-sm text-gray-500 text-center py-2">Không tìm thấy bệnh nhân</p>
              )}

              {/* Selected Patient */}
              {selectedPatient && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="text-sm text-green-600">Đã chọn:</p>
                    <p className="font-medium text-green-800">{selectedPatient.ten}</p>
                    <p className="text-sm text-green-600">Mã BN: {selectedPatient.id}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedPatient(null)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                <p className="font-medium mb-1">Hướng dẫn:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Chọn bệnh nhân cần đăng ký</li>
                  <li>Bấm &quot;Bắt đầu đăng ký&quot;</li>
                  <li>Yêu cầu bệnh nhân nhìn vào camera</li>
                  <li>Hệ thống sẽ tự động chụp 5 ảnh</li>
                </ol>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
                Hủy
              </Button>
              <Button 
                onClick={handleStartEnrollment}
                disabled={!selectedPatient || enrolling}
              >
                {enrolling ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang xử lý...</>
                ) : (
                  <><UserPlus className="h-4 w-4 mr-2" /> Bắt đầu đăng ký</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Live Stream Dialog */}
        <Dialog open={streamDialogOpen} onOpenChange={setStreamDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                {streamCamera && cameras[streamCamera]?.name} - Live Stream
              </DialogTitle>
            </DialogHeader>
            
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
              {streamCamera && serverOnline && snapshotUrl && !streamError ? (
                <img 
                  src={snapshotUrl}
                  alt="Camera Stream"
                  className="w-full h-auto"
                />
              ) : streamError ? (
                <div className="flex flex-col items-center justify-center h-96 text-red-400">
                  <VideoOff className="h-16 w-16 mb-4" />
                  <p className="text-center">Không thể kết nối camera</p>
                  <p className="text-sm text-gray-500 mt-2">Đảm bảo Python server đang chạy với code mới nhất</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => setStreamKey(prev => prev + 1)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Thử lại
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                  <Loader2 className="h-12 w-12 animate-spin mb-4" />
                  <p>Đang kết nối camera...</p>
                </div>
              )}
              
              {/* Overlay với trạng thái */}
              {streamCamera && cameras[streamCamera] && snapshotUrl && !streamError && (
                <div className="absolute top-4 left-4 flex gap-2">
                  <Badge 
                    className={`${cameras[streamCamera].state === 'enrolling' ? 'bg-yellow-500' : 'bg-green-500'} text-white`}
                  >
                    {getCameraStateText(cameras[streamCamera].state)}
                  </Badge>
                  {cameras[streamCamera].enrollment?.active && (
                    <Badge className="bg-yellow-500 text-white">
                      📸 {cameras[streamCamera].enrollment?.captured}/{cameras[streamCamera].enrollment?.required}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Khuôn mặt được đánh dấu bằng khung xanh • ~5 FPS
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setStreamKey(prev => prev + 1)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button 
                  size="sm"
                  onClick={() => {
                    if (streamCamera) {
                      setStreamDialogOpen(false);
                      openEnrollDialog(streamCamera);
                    }
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Đăng ký
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
