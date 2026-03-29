//src/pages/loc-trung.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Users, Check, Search, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import ProtectedRoute from '../components/ProtectedRoute';
import Link from "next/link";

interface BenhNhan {
  id?: number;
  ten: string;
  namsinh: string;
  dienthoai: string;
  diachi: string;
  tuoi?: number;
}

interface DuplicateGroup {
  key: string;
  reason: string;
  patients: BenhNhan[];
}

// Hàm chuẩn hóa tên (bỏ dấu, lowercase, trim)
function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hàm chuẩn hóa số điện thoại
function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, ''); // Chỉ giữ lại số
}

// Hàm tính độ tương đồng giữa 2 chuỗi (Levenshtein distance)
function similarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  
  return (longer.length - costs[longer.length]) / longer.length;
}

export default function LocTrungPage() {
  const { confirm } = useConfirm();
  const [benhNhans, setBenhNhans] = useState<BenhNhan[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState<boolean>(false);
  const [mainPatientId, setMainPatientId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // Bộ lọc: có thể chọn nhiều tiêu chí
  const [filterCriteria, setFilterCriteria] = useState<{
    name: boolean;      // Trùng tên
    age: boolean;       // Trùng tuổi
    phone: boolean;     // Trùng SĐT
    address: boolean;   // Trùng địa chỉ
    similar: boolean;   // Tên tương tự
  }>({
    name: true,
    age: false,
    phone: true,
    address: false,
    similar: false,
  });
  const [minSimilarity, setMinSimilarity] = useState<number>(0.8);
  const groupsPerPage = 20;

  // Đặt tiêu đề trang
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Lọc bệnh nhân trùng';
    }
  }, []);

  // Fetch tất cả bệnh nhân
  const fetchAllPatients = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch tất cả bệnh nhân (không phân trang)
      const res = await axios.get(`/api/benh-nhan?page=1&pageSize=10000&_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setBenhNhans(res.data.data || []);
      toast.success(`Đã tải ${res.data.data?.length || 0} bệnh nhân`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải danh sách: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllPatients();
  }, [fetchAllPatients]);

  // Phát hiện các nhóm bệnh nhân trùng
  const detectDuplicates = useCallback(() => {
    if (benhNhans.length === 0) return;

    // Kiểm tra có ít nhất 1 tiêu chí được chọn
    const hasAnyCriteria = filterCriteria.name || filterCriteria.age || filterCriteria.phone || filterCriteria.address || filterCriteria.similar;
    if (!hasAnyCriteria) {
      toast.error('Vui lòng chọn ít nhất 1 tiêu chí lọc!');
      return;
    }

    const groups: DuplicateGroup[] = [];

    // Tạo key cho mỗi bệnh nhân dựa trên các tiêu chí được chọn
    const createGroupKey = (bn: BenhNhan): string => {
      const parts: string[] = [];
      
      if (filterCriteria.name && bn.ten) {
        parts.push(`name:${normalizeName(bn.ten)}`);
      }
      if (filterCriteria.age && bn.tuoi !== undefined && bn.tuoi !== null) {
        parts.push(`age:${bn.tuoi}`);
      }
      if (filterCriteria.phone && bn.dienthoai) {
        const normalizedPhone = normalizePhone(bn.dienthoai);
        if (normalizedPhone.length >= 8) {
          parts.push(`phone:${normalizedPhone}`);
        }
      }
      if (filterCriteria.address && bn.diachi) {
        const normalizedAddress = normalizeName(bn.diachi);
        if (normalizedAddress.length >= 5) {
          parts.push(`addr:${normalizedAddress}`);
        }
      }
      
      return parts.join('|');
    };

    // Tạo mô tả cho nhóm
    const createGroupReason = (patients: BenhNhan[]): string => {
      const reasons: string[] = [];
      const first = patients[0];
      
      if (filterCriteria.name && first.ten) {
        reasons.push(`🔤 Tên: "${first.ten}"`);
      }
      if (filterCriteria.age && first.tuoi !== undefined) {
        reasons.push(`🎂 Tuổi: ${first.tuoi}`);
      }
      if (filterCriteria.phone && first.dienthoai) {
        reasons.push(`📞 SĐT: ${first.dienthoai}`);
      }
      if (filterCriteria.address && first.diachi) {
        reasons.push(`🏠 Địa chỉ: "${first.diachi}"`);
      }
      
      return reasons.join(' + ');
    };

    // Nếu không chọn "Tên tương tự", nhóm theo key chính xác
    if (!filterCriteria.similar) {
      const groupMap = new Map<string, BenhNhan[]>();
      
      benhNhans.forEach(bn => {
        const key = createGroupKey(bn);
        if (!key) return; // Bỏ qua nếu không có đủ thông tin
        
        // Đếm số tiêu chí thỏa mãn
        const criteriaCount = key.split('|').length;
        const selectedCount = [filterCriteria.name, filterCriteria.age, filterCriteria.phone, filterCriteria.address].filter(Boolean).length;
        
        // Chỉ nhóm nếu thỏa mãn TẤT CẢ tiêu chí được chọn
        if (criteriaCount < selectedCount) return;
        
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(bn);
      });

      groupMap.forEach((patients, key) => {
        if (patients.length > 1) {
          groups.push({
            key: `exact-${key}`,
            reason: createGroupReason(patients),
            patients: patients.sort((a, b) => (a.id || 0) - (b.id || 0))
          });
        }
      });
    } else {
      // Nếu chọn "Tên tương tự", dùng thuật toán so sánh từng cặp
      const checkedPairs = new Set<string>();
      const similarGroupMap = new Map<number, Set<number>>(); // Map từ patient ID đến các ID tương tự

      for (let i = 0; i < benhNhans.length; i++) {
        for (let j = i + 1; j < benhNhans.length; j++) {
          const bn1 = benhNhans[i];
          const bn2 = benhNhans[j];
          
          const pairKey = `${Math.min(bn1.id!, bn2.id!)}-${Math.max(bn1.id!, bn2.id!)}`;
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);

          let match = true;

          // Kiểm tra tên tương tự
          if (filterCriteria.similar) {
            if (!bn1.ten || !bn2.ten) {
              match = false;
            } else {
              const sim = similarity(normalizeName(bn1.ten), normalizeName(bn2.ten));
              if (sim < minSimilarity) match = false;
            }
          }

          // Kiểm tra tuổi (nếu được chọn)
          if (match && filterCriteria.age) {
            if (bn1.tuoi === undefined || bn2.tuoi === undefined || bn1.tuoi !== bn2.tuoi) {
              match = false;
            }
          }

          // Kiểm tra SĐT (nếu được chọn)
          if (match && filterCriteria.phone) {
            const phone1 = normalizePhone(bn1.dienthoai || '');
            const phone2 = normalizePhone(bn2.dienthoai || '');
            if (phone1.length < 8 || phone2.length < 8 || phone1 !== phone2) {
              match = false;
            }
          }

          // Kiểm tra địa chỉ (nếu được chọn)
          if (match && filterCriteria.address) {
            const addr1 = normalizeName(bn1.diachi || '');
            const addr2 = normalizeName(bn2.diachi || '');
            if (addr1.length < 5 || addr2.length < 5 || addr1 !== addr2) {
              match = false;
            }
          }

          if (match) {
            // Thêm vào nhóm
            if (!similarGroupMap.has(bn1.id!)) {
              similarGroupMap.set(bn1.id!, new Set([bn1.id!]));
            }
            if (!similarGroupMap.has(bn2.id!)) {
              similarGroupMap.set(bn2.id!, new Set([bn2.id!]));
            }
            
            // Gộp 2 nhóm
            const group1 = similarGroupMap.get(bn1.id!)!;
            const group2 = similarGroupMap.get(bn2.id!)!;
            const merged = new Set([...group1, ...group2]);
            
            merged.forEach(id => {
              similarGroupMap.set(id, merged);
            });
          }
        }
      }

      // Chuyển đổi thành mảng nhóm (loại bỏ trùng lặp)
      const processedGroups = new Set<string>();
      similarGroupMap.forEach((memberIds, patientId) => {
        if (memberIds.size > 1) {
          const sortedIds = Array.from(memberIds).sort((a, b) => a - b);
          const groupKey = sortedIds.join('-');
          
          if (!processedGroups.has(groupKey)) {
            processedGroups.add(groupKey);
            const patients = benhNhans.filter(bn => memberIds.has(bn.id!));
            
            if (patients.length > 1) {
              const simPercent = Math.round(similarity(
                normalizeName(patients[0].ten),
                normalizeName(patients[1].ten)
              ) * 100);
              
              const reasons: string[] = [`🔍 Tên tương tự (${simPercent}%)`];
              if (filterCriteria.age) reasons.push(`🎂 Cùng tuổi: ${patients[0].tuoi}`);
              if (filterCriteria.phone) reasons.push(`📞 Cùng SĐT`);
              if (filterCriteria.address) reasons.push(`🏠 Cùng địa chỉ`);
              
              groups.push({
                key: `similar-${groupKey}`,
                reason: reasons.join(' + '),
                patients: patients.sort((a, b) => (a.id || 0) - (b.id || 0))
              });
            }
          }
        }
      });
    }

    // Sắp xếp theo số lượng bệnh nhân trong nhóm
    groups.sort((a, b) => b.patients.length - a.patients.length);
    
    setDuplicateGroups(groups);
    setCurrentPage(1);
    
    if (groups.length === 0) {
      toast.success('Không tìm thấy bệnh nhân trùng!');
    } else {
      toast.success(`Tìm thấy ${groups.length} nhóm có thể trùng`);
    }
  }, [benhNhans, filterCriteria, minSimilarity]);

  // Toggle mở rộng nhóm
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Chọn bệnh nhân để gộp
  const toggleSelectForMerge = useCallback((patientId: number) => {
    setSelectedForMerge(prev => {
      if (prev.includes(patientId)) {
        return prev.filter(id => id !== patientId);
      } else {
        return [...prev, patientId];
      }
    });
  }, []);

  // Chọn tất cả bệnh nhân trong nhóm
  const selectAllInGroup = useCallback((patients: BenhNhan[]) => {
    const ids = patients.map(p => p.id!).filter(id => id !== undefined);
    setSelectedForMerge(prev => {
      const set = new Set(prev);
      ids.forEach(id => set.add(id));
      return Array.from(set);
    });
  }, []);

  // Bỏ chọn tất cả trong nhóm
  const deselectAllInGroup = useCallback((patients: BenhNhan[]) => {
    const ids = new Set(patients.map(p => p.id!));
    setSelectedForMerge(prev => prev.filter(id => !ids.has(id)));
  }, []);

  // Xử lý gộp bệnh nhân
  const handleMergePatients = useCallback(async () => {
    if (selectedForMerge.length < 2) {
      toast.error('Vui lòng chọn ít nhất 2 bệnh nhân để gộp!');
      return;
    }
    setShowMergeDialog(true);
  }, [selectedForMerge.length]);

  // Xác nhận gộp
  const handleConfirmMerge = useCallback(async () => {
    if (!mainPatientId) {
      toast.error('Vui lòng chọn bệnh nhân chính!');
      return;
    }

    const patientIdsToMerge = selectedForMerge.filter(id => id !== mainPatientId);

    const confirmMessage = `Bạn có chắc chắn muốn gộp ${patientIdsToMerge.length} bệnh nhân vào bệnh nhân ID ${mainPatientId}?\n\n` +
      `⚠️ Hành động này KHÔNG THỂ HOÀN TÁC!`;

    if (!await confirm(confirmMessage)) return;

    try {
      await axios.post('/api/benh-nhan/merge', {
        mainPatientId,
        patientIdsToMerge
      });

      toast.success(`Đã gộp thành công ${patientIdsToMerge.length} bệnh nhân!`);
      
      // Reset states
      setSelectedForMerge([]);
      setShowMergeDialog(false);
      setMainPatientId(null);
      
      // Refresh danh sách
      await fetchAllPatients();
      
      // Phát hiện lại trùng
      setTimeout(() => detectDuplicates(), 500);
      
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) && error.response?.data?.message 
        ? error.response.data.message 
        : error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi gộp: ${message}`);
    }
  }, [selectedForMerge, mainPatientId, fetchAllPatients, detectDuplicates]);

  // Pagination
  const totalPages = Math.ceil(duplicateGroups.length / groupsPerPage);
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * groupsPerPage;
    return duplicateGroups.slice(start, start + groupsPerPage);
  }, [duplicateGroups, currentPage]);

  // Thống kê
  const stats = useMemo(() => {
    const totalPatients = benhNhans.length;
    const totalGroups = duplicateGroups.length;
    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.patients.length, 0);
    return { totalPatients, totalGroups, totalDuplicates };
  }, [benhNhans, duplicateGroups]);

  return (
    <ProtectedRoute>
      <div className="p-4 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-orange-500" />
                Lọc Bệnh Nhân Trùng
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                Tìm và gộp các bệnh nhân bị trùng lặp trong hệ thống
              </p>
            </div>
            <Link href="/benh-nhan">
              <Button variant="outline">← Quay lại Quản lý BN</Button>
            </Link>
          </div>

          {/* Thống kê */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalPatients}</div>
                <div className="text-sm text-gray-600">Tổng bệnh nhân</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.totalGroups}</div>
                <div className="text-sm text-gray-600">Nhóm trùng</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{stats.totalDuplicates}</div>
                <div className="text-sm text-gray-600">BN có thể trùng</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{selectedForMerge.length}</div>
                <div className="text-sm text-gray-600">Đã chọn gộp</div>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-lg border">
            <div className="w-full mb-2">
              <label className="text-sm font-medium block mb-2">Tiêu chí lọc trùng:</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCriteria.name}
                    onChange={(e) => setFilterCriteria(prev => ({ ...prev, name: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">🔤 Trùng tên</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCriteria.age}
                    onChange={(e) => setFilterCriteria(prev => ({ ...prev, age: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">🎂 Trùng tuổi</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCriteria.phone}
                    onChange={(e) => setFilterCriteria(prev => ({ ...prev, phone: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">📞 Trùng SĐT</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCriteria.address}
                    onChange={(e) => setFilterCriteria(prev => ({ ...prev, address: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">🏠 Trùng địa chỉ</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCriteria.similar}
                    onChange={(e) => setFilterCriteria(prev => ({ ...prev, similar: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">🔍 Tên tương tự</span>
                </label>
              </div>
            </div>

            {filterCriteria.similar && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Độ tương tự tối thiểu:</label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(minSimilarity * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setMinSimilarity(Math.min(100, Math.max(0, val)) / 100);
                    }}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
              </div>
            )}

            <Button onClick={detectDuplicates} disabled={loading || benhNhans.length === 0}>
              <Search className="w-4 h-4 mr-2" />
              Tìm trùng lặp
            </Button>

            <Button onClick={fetchAllPatients} variant="outline" disabled={loading}>
              {loading ? 'Đang tải...' : '🔄 Tải lại dữ liệu'}
            </Button>

            {selectedForMerge.length >= 2 && (
              <Button 
                onClick={handleMergePatients}
                className="bg-green-600 hover:bg-green-700"
              >
                <Users className="w-4 h-4 mr-2" />
                Gộp {selectedForMerge.length} bệnh nhân
              </Button>
            )}
          </div>
        </div>

        {/* Danh sách nhóm trùng */}
        <div className="space-y-3">
          {paginatedGroups.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {loading ? (
                  <div>Đang tải dữ liệu...</div>
                ) : duplicateGroups.length === 0 ? (
                  <div>
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Nhấn "Tìm trùng lặp" để bắt đầu quét</p>
                  </div>
                ) : (
                  <div>Không có kết quả</div>
                )}
              </CardContent>
            </Card>
          ) : (
            paginatedGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const allSelected = group.patients.every(p => selectedForMerge.includes(p.id!));
              const someSelected = group.patients.some(p => selectedForMerge.includes(p.id!));

              return (
                <Card key={group.key} className={someSelected ? 'ring-2 ring-green-500' : ''}>
                  <CardContent className="p-0">
                    {/* Header của nhóm */}
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                        <div>
                          <div className="font-medium">{group.reason}</div>
                          <div className="text-sm text-gray-500">
                            {group.patients.length} bệnh nhân trong nhóm
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant={allSelected ? 'destructive' : 'outline'}
                          onClick={() => {
                            if (allSelected) {
                              deselectAllInGroup(group.patients);
                            } else {
                              selectAllInGroup(group.patients);
                            }
                          }}
                        >
                          {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                      </div>
                    </div>

                    {/* Chi tiết bệnh nhân trong nhóm */}
                    {isExpanded && (
                      <div className="border-t">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left w-10"></th>
                              <th className="px-4 py-2 text-left">ID</th>
                              <th className="px-4 py-2 text-left">Họ tên</th>
                              <th className="px-4 py-2 text-left">Năm sinh</th>
                              <th className="px-4 py-2 text-left">Tuổi</th>
                              <th className="px-4 py-2 text-left">SĐT</th>
                              <th className="px-4 py-2 text-left">Địa chỉ</th>
                              <th className="px-4 py-2 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.patients.map((bn) => {
                              const isSelected = selectedForMerge.includes(bn.id!);
                              return (
                                <tr 
                                  key={bn.id} 
                                  className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-green-100' : ''}`}
                                >
                                  <td className="px-4 py-2">
                                    <button
                                      onClick={() => toggleSelectForMerge(bn.id!)}
                                      className={`w-6 h-6 border-2 rounded flex items-center justify-center ${
                                        isSelected 
                                          ? 'bg-green-600 border-green-600 text-white' 
                                          : 'border-gray-300 hover:border-green-500'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-4 h-4" />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-2 font-mono">{bn.id}</td>
                                  <td className="px-4 py-2 font-medium">{bn.ten}</td>
                                  <td className="px-4 py-2">{bn.namsinh}</td>
                                  <td className="px-4 py-2">{bn.tuoi ?? '-'}</td>
                                  <td className="px-4 py-2">{bn.dienthoai || '-'}</td>
                                  <td className="px-4 py-2 max-w-[200px] truncate" title={bn.diachi}>
                                    {bn.diachi || '-'}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <a
                                      href={`/ke-don?bn=${bn.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline text-xs"
                                    >
                                      Xem đơn
                                    </a>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}

        {/* Dialog chọn bệnh nhân chính để gộp */}
        <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chọn bệnh nhân chính để giữ lại</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-4">
                Chọn bệnh nhân muốn giữ lại. Tất cả đơn thuốc/đơn kính của các bệnh nhân khác sẽ được chuyển cho bệnh nhân này.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {benhNhans
                  .filter(bn => selectedForMerge.includes(bn.id!))
                  .map((bn) => (
                    <div 
                      key={bn.id} 
                      className={`border rounded p-3 cursor-pointer transition-colors ${
                        mainPatientId === bn.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setMainPatientId(bn.id!)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="mainPatient"
                          checked={mainPatientId === bn.id}
                          onChange={() => setMainPatientId(bn.id!)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {bn.ten} (ID: {bn.id})
                          </div>
                          <div className="text-sm text-gray-600">
                            Năm sinh: {bn.namsinh} • SĐT: {bn.dienthoai || 'Chưa có'}
                          </div>
                          <div className="text-sm text-gray-500">
                            Địa chỉ: {bn.diachi}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowMergeDialog(false);
                  setMainPatientId(null);
                }}
              >
                Hủy
              </Button>
              <Button 
                onClick={handleConfirmMerge}
                disabled={!mainPatientId}
                className="bg-green-600 hover:bg-green-700"
              >
                Gộp bệnh nhân
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
