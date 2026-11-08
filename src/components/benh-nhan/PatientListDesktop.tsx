'use client';

/**
 * Khối layout desktop (hidden md:block) của trang /benh-nhan.
 * Props: bảng BN, sort, pagination, hàng mở rộng dùng PatientRecordTabs — xem PatientListDesktopProps.
 */
import React from 'react';
import { Plus, Pencil, Users, Check, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import type { BenhNhan, ChainHistory, DonKinh, HenKham, PatientNote, SortConfigItem, SortField } from '@/lib/patient/types';
import { PatientRecordTabs, type FilteredDonThuoc } from '@/components/benh-nhan/PatientRecordTabs';

export interface PatientListDesktopProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCreatePatientFromSearch: () => void;
  onMergePatients: () => void;
  selectedForMerge: number[];
  rowsPerPage: number;
  onRowsPerPageChange: (rows: number) => void;
  filteredCount: number;
  sortConfig: SortConfigItem[];
  onSort: (field: SortField, isShiftKey: boolean) => void;
  renderSortIndicator: (field: SortField) => React.ReactNode;
  paginated: BenhNhan[];
  startIndex: number;
  allSelectedCurrentPage: boolean;
  onToggleSelectAllCurrentPage: () => void;
  isMultiBranch: boolean;
  onToggleSelectForMerge: (id: number) => void;
  onSelectPatient: (id: number) => void;
  onEditPatient: (bn: BenhNhan) => void;
  openPatientNotesManager: (bn: BenhNhan) => void;
  onOpenPrescription: (bn: BenhNhan, type: 'thuoc' | 'kinh') => void;
  selectedBenhNhanId: number | null;
  activeTab: string;
  onHistoryTabChange: (tab: string) => void;
  filteredDonThuocs: FilteredDonThuoc[];
  donKinhs: DonKinh[];
  henKhams: HenKham[];
  historyNotesByPatient: Record<number, PatientNote[]>;
  loadingHistoryPatientId: number | null;
  chainHistory: ChainHistory | null;
  loadingChainHistory: boolean;
  onSelectFamilyMember: (id: number) => void;
  currentPage: number;
  totalPages: number;
  onListPageChange: (page: number) => void;
}

export function PatientListDesktop({
  search,
  onSearchChange,
  onCreatePatientFromSearch,
  onMergePatients,
  selectedForMerge,
  rowsPerPage,
  onRowsPerPageChange,
  filteredCount,
  sortConfig,
  onSort,
  renderSortIndicator,
  paginated,
  startIndex,
  allSelectedCurrentPage,
  onToggleSelectAllCurrentPage,
  isMultiBranch,
  onToggleSelectForMerge,
  onSelectPatient,
  onEditPatient,
  openPatientNotesManager,
  onOpenPrescription,
  selectedBenhNhanId,
  activeTab,
  onHistoryTabChange,
  filteredDonThuocs,
  donKinhs,
  henKhams,
  historyNotesByPatient,
  loadingHistoryPatientId,
  chainHistory,
  loadingChainHistory,
  onSelectFamilyMember,
  currentPage,
  totalPages,
  onListPageChange,
}: PatientListDesktopProps) {
  return (
        <div className="hidden md:block w-full">
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Quản Lý Bệnh Nhân</h1>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Tên hoặc SĐT..."
                  value={search}
                  onChange={(e) => {
                    onSearchChange(e.target.value)
                  }}
                  className="w-64 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    onCreatePatientFromSearch();
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Thêm
                </Button>
                
                {/* Nút quản lý gộp bệnh nhân - Desktop */}
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={onMergePatients}
                  disabled={selectedForMerge.length < 2}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Gộp bệnh nhân ({selectedForMerge.length})
                </Button>

                
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    onRowsPerPageChange(+e.target.value)
                  }}
                  className="border px-2 py-1 rounded text-sm"
                >
                  {[50, 100, 200, 500, 1000].map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tổng số bệnh nhân */}
            <div className="text-sm text-muted-foreground">
              Tổng cộng: {filteredCount} bệnh nhân
              {selectedForMerge.length > 0 && (
                <span className="ml-4 text-blue-600 font-medium">
                  • Đã chọn {selectedForMerge.length} bệnh nhân để gộp
                </span>
              )}
              {sortConfig.length > 0 && (
                <span className="ml-4 text-green-600 font-medium">
                  • Sắp xếp: {sortConfig.map((s, i) => {
                    const fieldNames: Record<SortField, string> = {
                      ten: 'Tên',
                      namsinh: 'Năm sinh',
                      tuoi: 'Tuổi',
                      dienthoai: 'SĐT',
                      diachi: 'Địa chỉ',
                      created_at: 'Ngày lập',
                      ngay_kham_gan_nhat: 'Khám gần nhất'
                    };
                    return `${i + 1}. ${fieldNames[s.field]} ${s.direction === 'asc' ? '↑' : '↓'}`;
                  }).join(' → ')}
                </span>
              )}
            </div>

            {/* Bảng bệnh nhân */}
            <Card>
              <CardContent className="p-0">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-1 py-1 w-8 text-center">
                        <button
                          onClick={onToggleSelectAllCurrentPage}
                          title={allSelectedCurrentPage ? 'Bỏ chọn tất cả' : 'Chọn tất cả trang này'}
                          className={`h-5 w-5 border-2 rounded flex items-center justify-center transition-colors mx-auto ${
                            allSelectedCurrentPage
                              ? 'bg-green-700 border-green-700 text-white'
                              : 'border-gray-400 hover:border-blue-500'
                          }`}
                        >
                          {allSelectedCurrentPage && <Check className="w-3 h-3" />}
                        </button>
                      </th>
                      <th className="px-2 py-1 w-12">STT</th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => onSort('ten', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Họ Tên {renderSortIndicator('ten')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => onSort('namsinh', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Ngày Sinh {renderSortIndicator('namsinh')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => onSort('tuoi', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Tuổi {renderSortIndicator('tuoi')}</div>
                      </th>
                      <th className="px-2 py-1">Giới tính</th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => onSort('dienthoai', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Điện Thoại {renderSortIndicator('dienthoai')}</div>
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => onSort('diachi', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Địa Chỉ {renderSortIndicator('diachi')}</div>
                      </th>
                      <th
                        className="px-1 py-1 cursor-pointer select-none whitespace-nowrap"
                        onClick={(e) => onSort('created_at', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Ngày lập {renderSortIndicator('created_at')}</div>
                      </th>
                      <th
                        className="px-1 py-1 cursor-pointer select-none whitespace-nowrap"
                        onClick={(e) => onSort('ngay_kham_gan_nhat', e.shiftKey)}
                        title="Click: Sắp xếp | Shift+Click: Thêm sắp xếp phụ"
                      >
                        <div className="flex items-center gap-1">Khám GN {renderSortIndicator('ngay_kham_gan_nhat')}</div>
                      </th>
                      {isMultiBranch && <th className="px-2 py-1">Chi nhánh</th>}
                      <th className="px-2 py-1 text-center">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((bn, index) => {
                      const isSelected = selectedForMerge.includes(bn.id!);
                      const stt = startIndex + index + 1;
                      
                      return (
                      <React.Fragment key={bn.id}>
                        <tr className={`border-b transition-colors ${isSelected ? 'bg-green-200 font-semibold border-green-500' : 'hover:bg-blue-100'}`}>
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => onToggleSelectForMerge(bn.id!)}
                              title={isSelected ? 'Bỏ chọn gộp' : 'Chọn để gộp'}
                              className={`h-5 w-5 border-2 rounded flex items-center justify-center transition-colors mx-auto ${
                                isSelected
                                  ? 'bg-green-700 border-green-700 text-white shadow'
                                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-100'
                              }`}
                              aria-pressed={isSelected}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 font-mono text-center">{stt}</td>
                          <td
                            className={`px-2 py-1 cursor-pointer ${isSelected ? 'text-green-800 font-bold' : 'text-black font-bold hover:text-blue-700'}`}
                            onClick={() => onSelectPatient(bn.id!)}
                          >
                            {bn.ten}
                          </td>
                          <td className="px-2 py-1">{typeof bn.namsinh === 'number' ? bn.namsinh : bn.namsinh}</td>
                          <td className="px-2 py-1">{bn.tuoi ?? ""}</td>
                          <td className="px-2 py-1">{bn.gioitinh || ""}</td>
                          <td className="px-2 py-1">{bn.dienthoai}</td>
                          <td className="px-2 py-1">{bn.diachi}</td>
                          <td className="px-1 py-1 text-xs text-gray-600 whitespace-nowrap">{bn.created_at ? new Date(bn.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
                          <td className="px-1 py-1 text-xs text-gray-600 whitespace-nowrap">{bn.ngay_kham_gan_nhat ? new Date(bn.ngay_kham_gan_nhat).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
                          {isMultiBranch && (
                            <td className="px-2 py-1 text-xs text-gray-500">{bn.branch?.ten_chi_nhanh || '-'}</td>
                          )}
                          <td className="px-2 py-1 text-center">
                            <div className="inline-flex items-center gap-0.5">
                              <Button size="sm" variant="outline" onClick={() => onEditPatient(bn)} className="h-7 w-7 p-0" title="Sửa">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={() => openPatientNotesManager(bn)}
                                title="Ghi chú bệnh nhân"
                              >
                                <AlertTriangle className="w-3 h-3" />
                              </Button>
                              <div className="flex items-center rounded-md overflow-hidden border border-blue-600 ml-0.5">
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={() => onOpenPrescription(bn, 'thuoc')}
                                  title="Kê đơn thuốc"
                                >
                                  Thuốc
                                </button>
                                <div className="w-px h-5 bg-blue-400" />
                                <button
                                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                  onClick={() => onOpenPrescription(bn, 'kinh')}
                                  title="Kê đơn kính"
                                >
                                  Kính
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {selectedBenhNhanId === bn.id && (
                          <tr>
                            <td colSpan={10} className="px-2 py-1">
                              <Card className="shadow-sm bg-gray-50 border-gray-200">
                                <CardContent className="p-3">
                                  <PatientRecordTabs
                                    patient={bn}
                                    activeTab={activeTab}
                                    onTabChange={onHistoryTabChange}
                                    isMultiBranch={isMultiBranch}
                                    filteredDonThuocs={filteredDonThuocs}
                                    donKinhs={donKinhs}
                                    henKhams={henKhams}
                                    historyNotesByPatient={historyNotesByPatient}
                                    loadingHistoryPatientId={loadingHistoryPatientId}
                                    chainHistory={chainHistory}
                                    loadingChainHistory={loadingChainHistory}
                                    openPatientNotesManager={openPatientNotesManager}
                                    onSelectFamilyMember={onSelectFamilyMember}
                                  />
                                </CardContent>
                              </Card>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-2 text-muted-foreground">
                          Không tìm thấy bệnh nhân.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Desktop Pagination */}
            <div className="mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  onListPageChange(page)
                }}
              />
            </div>
          </div>
        </div>
  );
}
