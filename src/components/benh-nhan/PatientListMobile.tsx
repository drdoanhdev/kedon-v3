'use client';

/**
 * Khối layout mobile (block md:hidden) của trang /benh-nhan.
 * Props: search, onSearchChange, paginated, filtered, merge/swipe/history callbacks — xem PatientListMobileProps.
 */
import React from 'react';
import {
  Search,
  UserPlus,
  Users,
  Check,
  Pencil,
  Pill,
  Eye,
  Calendar,
  Phone,
  MapPin,
  Building2,
  BellRing,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SimplePagination } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FamilyCard from '@/components/FamilyCard';
import { SWIPE_ACTION_WIDTH_PX, TRANG_THAI_MAP } from '@/lib/patient/constants';
import type {
  BenhNhan,
  ChainHistory,
  DonKinh,
  HenKham,
  PatientNote,
} from '@/lib/patient/types';
import type { FilteredDonThuoc } from '@/components/benh-nhan/PatientRecordTabs';

export interface PatientListMobileProps {
  search: string;
  onSearchChange: (value: string) => void;
  paginated: BenhNhan[];
  filteredCount: number;
  selectedForMerge: number[];
  onMergePatients: () => void;
  onCreatePatientFromSearch: () => void;
  openSwipePatientId: number | null;
  draggingPatientId: number | null;
  dragOffsetPx: number;
  onCloseSwipe: () => void;
  onSwipeStart: (patientId: number, e: React.TouchEvent<HTMLDivElement>) => void;
  onSwipeMove: (patientId: number, e: React.TouchEvent<HTMLDivElement>) => void;
  onSwipeEnd: (patientId: number) => void;
  onToggleSelectForMerge: (id: number) => void;
  onEditPatient: (bn: BenhNhan) => void;
  onOpenPrescription: (bn: BenhNhan, type: 'thuoc' | 'kinh') => void;
  onSelectPatient: (id: number) => void;
  selectedBenhNhanId: number | null;
  activeTab: string;
  onHistoryTabChange: (tab: string) => void;
  isMultiBranch: boolean;
  filteredDonThuocs: FilteredDonThuoc[];
  donKinhs: DonKinh[];
  henKhams: HenKham[];
  historyNotesByPatient: Record<number, PatientNote[]>;
  loadingHistoryPatientId: number | null;
  chainHistory: ChainHistory | null;
  loadingChainHistory: boolean;
  openPatientNotesManager: (bn: BenhNhan) => void;
  onSelectFamilyMember: (id: number) => void;
  currentPage: number;
  totalPages: number;
  onListPageChange: (page: number) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (rows: number) => void;
}

export function PatientListMobile({
  search,
  onSearchChange,
  paginated,
  filteredCount,
  selectedForMerge,
  onMergePatients,
  onCreatePatientFromSearch,
  openSwipePatientId,
  draggingPatientId,
  dragOffsetPx,
  onCloseSwipe,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  onToggleSelectForMerge,
  onEditPatient,
  onOpenPrescription,
  onSelectPatient,
  selectedBenhNhanId,
  activeTab,
  onHistoryTabChange,
  isMultiBranch,
  filteredDonThuocs,
  donKinhs,
  henKhams,
  historyNotesByPatient,
  loadingHistoryPatientId,
  chainHistory,
  loadingChainHistory,
  openPatientNotesManager,
  onSelectFamilyMember,
  currentPage,
  totalPages,
  onListPageChange,
  rowsPerPage,
  onRowsPerPageChange,
}: PatientListMobileProps) {
  return (
  <div className="block md:hidden">
          {/* Header Mobile */}
          <div className="sticky top-0 z-30 -mx-2 bg-[#1976D2] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <Search className="w-[1.6rem] h-[1.6rem] text-white shrink-0" />
              <div className="flex-1 overflow-hidden">
                <Input
                  placeholder="Tên hoặc SĐT"
                  value={search}
                  onChange={(e) => {
                    onSearchChange(e.target.value)
                  }}
                  className="h-10 border-0 bg-transparent text-white placeholder:text-white/80 shadow-none focus:bg-white focus:text-gray-900 focus:placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <Button
                type="button"
                className={`shrink-0 rounded-none border-0 bg-transparent text-white shadow-none hover:bg-transparent ${selectedForMerge.length > 0 ? 'h-10 px-2' : 'h-12 w-14 p-0'}`}
                onClick={() => {
                  if (selectedForMerge.length > 0) {
                    onMergePatients();
                    return;
                  }

                  onCreatePatientFromSearch();
                }}
              >
                {selectedForMerge.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-5 h-5" />
                    Gộp BN
                  </span>
                ) : (
                  <UserPlus className="size-[1.6rem]" />
                )}
              </Button>
            </div>
          </div>

          {/* Patient List Mobile */}
          <div className="mt-0 -mx-2">
            <div className="space-y-0">
              {paginated.length === 0 ? (
                <p className="px-2 py-2 text-sm text-gray-500">Không tìm thấy bệnh nhân.</p>
              ) : (
                paginated.map((bn, index) => {
                  const isSelected = selectedForMerge.includes(bn.id!);
                  const isSwipeOpen = openSwipePatientId === bn.id;
                  const isDraggingThisCard = draggingPatientId === bn.id;
                  const ngaySinhText = typeof bn.namsinh === 'number' ? `${bn.namsinh}` : (bn.namsinh || '--');
                  const cardTranslateX = isDraggingThisCard
                    ? dragOffsetPx
                    : (isSwipeOpen ? -SWIPE_ACTION_WIDTH_PX : 0);
                  
                  return (
                  <div key={bn.id} className="space-y-2">
                    {/* Vuốt ngang để lộ action panel giống FAB list */}
                    <div className={`relative bg-white overflow-hidden border-x border-b border-gray-200 ${index === 0 ? 'border-t' : ''}`}>
                      <div
                        className="absolute inset-y-0 right-0 grid grid-cols-3 overflow-hidden rounded-l-lg"
                        style={{ width: SWIPE_ACTION_WIDTH_PX }}
                      >
                        <button
                          type="button"
                          className="h-full bg-red-600 text-white text-[11px] font-semibold leading-tight active:bg-red-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => {
                            onCloseSwipe();
                            onEditPatient(bn);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="h-full bg-blue-600 text-white text-[11px] font-semibold leading-tight active:bg-blue-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => onOpenPrescription(bn, 'thuoc')}
                        >
                          <Pill className="w-3.5 h-3.5" />
                          Đơn thuốc
                        </button>
                        <button
                          type="button"
                          className="h-full bg-emerald-600 text-white text-[11px] font-semibold leading-tight active:bg-emerald-700 flex flex-col items-center justify-center gap-1 px-1"
                          onClick={() => onOpenPrescription(bn, 'kinh')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Đơn kính
                        </button>
                      </div>

                      <div
                        className={`relative p-3 touch-pan-y ${isDraggingThisCard ? '' : 'transition-transform duration-200 ease-out'} ${isSelected ? 'bg-green-100' : 'bg-white'}`}
                        style={{
                          transform: `translateX(${cardTranslateX}px)`,
                          willChange: 'transform',
                        }}
                        onTouchStart={(e) => onSwipeStart(bn.id!, e)}
                        onTouchMove={(e) => onSwipeMove(bn.id!, e)}
                        onTouchEnd={() => onSwipeEnd(bn.id!)}
                        onTouchCancel={() => onSwipeEnd(bn.id!)}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-green-700 border-green-700 text-white'
                                : 'bg-blue-100 border-blue-200 text-blue-700'
                            }`}
                            onClick={() => onToggleSelectForMerge(bn.id!)}
                            aria-pressed={isSelected}
                            title={isSelected ? 'Bỏ chọn gộp' : 'Chọn để gộp'}
                          >
                            {isSelected ? <Check className="w-4 h-4" /> : (bn.ten || '?')[0]?.toUpperCase()}
                          </button>

                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              onCloseSwipe();
                              onSelectPatient(bn.id!);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className={`flex-1 min-w-0 text-[16px] leading-5 truncate ${isSelected ? 'font-bold text-green-800' : 'font-semibold text-gray-800'}`}>
                                {bn.ten}
                                {bn.gioitinh ? ` (${bn.gioitinh})` : ''}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[13px] text-gray-500 shrink-0 ml-2">
                                <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                                {ngaySinhText}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-700 min-w-0">
                              <span className="inline-flex items-center gap-1.5">
                                <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                                {bn.dienthoai || '--'}
                              </span>
                              <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                                <span className="truncate">{bn.diachi || '--'}</span>
                              </span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Medical History Mobile */}
                    {selectedBenhNhanId === bn.id && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="mb-2">
                          <h3 className="font-medium text-sm">📋 Lịch sử khám bệnh</h3>
                        </div>
                        <Tabs value={activeTab} onValueChange={onHistoryTabChange} className="w-full">
                          <TabsList className="mb-2 w-full justify-start overflow-x-auto">
                            <TabsTrigger value="don-thuoc">Đơn thuốc ({filteredDonThuocs.length})</TabsTrigger>
                            <TabsTrigger value="don-kinh">Đơn kính ({donKinhs.length})</TabsTrigger>
                            <TabsTrigger value="lich-hen">Lịch hẹn ({henKhams.length})</TabsTrigger>
                            <TabsTrigger value="gia-dinh">Gia đình</TabsTrigger>
                            <TabsTrigger value="ghi-chu">Ghi chú</TabsTrigger>
                            {isMultiBranch && (
                              <TabsTrigger value="chuoi">
                                <Building2 className="w-3 h-3 mr-1" />
                                Chuỗi
                              </TabsTrigger>
                            )}
                          </TabsList>
                          
                          <TabsContent value="don-thuoc" className="mt-2">
                            {filteredDonThuocs.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có đơn thuốc nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {filteredDonThuocs.map((don) => (
                                  <div key={don.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                                        </span>
                                        {isMultiBranch && don.branch?.ten_chi_nhanh && (
                                          <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded font-medium">
                                            🏬 {don.branch.ten_chi_nhanh}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs font-bold text-blue-600">
                                        {(don.tongtien / 1000).toFixed(0)}k
                                      </span>
                                    </div>
                                    {don.chandoan && (
                                      <div className="text-xs font-semibold text-gray-800 mb-1.5">{don.chandoan}</div>
                                    )}
                                    {don.chiTietList.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-1.5">
                                        {don.chiTietList.map((ct, i) => (
                                          <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-100">
                                            {ct.thuoc.tenthuoc} ×{ct.soluong}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {don.dienTien !== '-' && (
                                      <div className="text-[10px] text-gray-500 italic">
                                        Diễn tiến: {don.dienTien}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>
                          
                          <TabsContent value="don-kinh" className="mt-2">
                            {donKinhs.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có đơn kính nào.</p>
                            ) : (
                              <div className="space-y-2">
                                {donKinhs.map((don) => (
                                  <div key={don.id} className="bg-blue-50 border rounded p-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="text-xs text-gray-600">
                                        {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                                      </div>
                                      {isMultiBranch && don.branch?.ten_chi_nhanh && (
                                        <span className="text-[10px] text-purple-700 bg-white border border-purple-100 px-1.5 py-0.5 rounded font-medium">
                                          🏬 {don.branch.ten_chi_nhanh}
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                      <div>
                                        <strong>MP:</strong> {don.sokinh_moi_mp || 'Chưa có'}
                                      </div>
                                      <div>
                                        <strong>MT:</strong> {don.sokinh_moi_mt || 'Chưa có'}
                                      </div>
                                    </div>
                                    {don.ten_gong && (
                                      <div className="text-[11px] text-gray-500 mb-1.5">Gọng: {don.ten_gong}</div>
                                    )}
                                    <div className="flex justify-between items-center">
                                      <div className="text-sm font-medium text-blue-600">
                                        {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k VND
                                      </div>
                                      {(() => {
                                        const tongTienKinh = (don.giatrong || 0) + (don.giagong || 0);
                                        const conNo = tongTienKinh - (don.sotien_da_thanh_toan || 0);
                                        return (
                                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                            conNo <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                          }`}>
                                            {conNo <= 0 ? 'Đã TT' : `Nợ: ${(conNo / 1000).toFixed(0)}k`}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="lich-hen" className="mt-2">
                            {henKhams.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có lịch hẹn nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {henKhams.map((hen) => {
                                  const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
                                  return (
                                    <div key={hen.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {new Date(hen.ngay_hen).toLocaleDateString('vi-VN')}
                                          {hen.gio_hen && ` ${hen.gio_hen.substring(0, 5)}`}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                                          {st.label}
                                        </span>
                                      </div>
                                      {hen.ly_do && <div className="text-xs font-semibold text-gray-800 mb-1">{hen.ly_do}</div>}
                                      {hen.ghichu && <div className="text-[10px] text-gray-500 italic">{hen.ghichu}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="gia-dinh" className="mt-2">
                            <FamilyCard
                              benhnhanId={bn.id!}
                              patientName={bn.ten || ''}
                              onSelectMember={onSelectFamilyMember}
                            />
                          </TabsContent>

                          <TabsContent value="ghi-chu" className="mt-2">
                            {loadingHistoryPatientId === bn.id ? (
                              <p className="text-xs text-gray-500">Đang tải ghi chú...</p>
                            ) : ((historyNotesByPatient[bn.id!] || []).filter((a) => !a.deleted_at).length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có ghi chú nào.</p>
                            ) : (
                              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                {(historyNotesByPatient[bn.id!] || [])
                                  .filter((a) => !a.deleted_at)
                                  .map((a) => (
                                    <div key={a.id} className="bg-white border rounded-lg p-2.5 shadow-sm">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-[11px] text-gray-500">
                                          {new Date(a.created_at).toLocaleTimeString('vi-VN')} - {new Date(a.created_at).toLocaleDateString('vi-VN')}
                                        </p>
                                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${a.note_type === 'important' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                          {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                                        </span>
                                      </div>
                                      <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-800">{a.content}</p>
                                    </div>
                                  ))}
                              </div>
                            ))}
                            <div className="mt-2">
                              <Button size="sm" variant="outline" className="h-8" onClick={() => openPatientNotesManager(bn)}>
                                <BellRing className="w-3.5 h-3.5 mr-1" /> Quản lý ghi chú
                              </Button>
                            </div>
                          </TabsContent>

                          {isMultiBranch && (
                            <TabsContent value="chuoi" className="mt-2">
                              {loadingChainHistory ? (
                                <p className="text-xs text-gray-500">Đang tải lịch sử chuỗi...</p>
                              ) : !chainHistory ? (
                                <p className="text-xs text-gray-500">Không tải được lịch sử chuỗi.</p>
                              ) : (
                                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                  <div className="flex flex-wrap gap-1.5">
                                    {(chainHistory.by_branch || []).map((b, i) => (
                                      <span key={i} className="text-[10px] bg-purple-50 text-purple-800 border border-purple-100 px-1.5 py-0.5 rounded">
                                        {b.ten}: {b.don_kinh} kính / {b.don_thuoc} thuốc
                                      </span>
                                    ))}
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold mb-1">Đơn kính toàn chuỗi</p>
                                    {(chainHistory.don_kinh || []).length === 0 ? (
                                      <p className="text-xs text-gray-400">Chưa có đơn kính.</p>
                                    ) : (
                                      (chainHistory.don_kinh || []).slice(0, 20).map((d) => (
                                        <div key={d.id} className="text-xs border rounded p-2 mb-1.5 bg-white">
                                          <div className="flex justify-between gap-2">
                                            <span>{d.ngay_kham ? new Date(d.ngay_kham).toLocaleDateString('vi-VN') : '—'}</span>
                                            <span className="text-purple-700">{d.branch?.ten_chi_nhanh || '—'}</span>
                                          </div>
                                          <div className="text-gray-600 mt-0.5">
                                            MP {d.sph_mp}/{d.cyl_mp} · MT {d.sph_mt}/{d.cyl_mt}
                                            {d.lab_status ? ` · Lab: ${d.lab_status}` : ''}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold mb-1">Đơn thuốc toàn chuỗi</p>
                                    {(chainHistory.don_thuoc || []).length === 0 ? (
                                      <p className="text-xs text-gray-400">Chưa có đơn thuốc.</p>
                                    ) : (
                                      (chainHistory.don_thuoc || []).slice(0, 20).map((d) => (
                                        <div key={d.id} className="text-xs border rounded p-2 mb-1.5 bg-white flex justify-between">
                                          <span>{d.ngay_kham ? new Date(d.ngay_kham).toLocaleDateString('vi-VN') : '—'}</span>
                                          <span className="text-purple-700">{d.branch?.ten_chi_nhanh || '—'}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                            </TabsContent>
                          )}
                        </Tabs>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>

            {/* Mobile Pagination */}
            <div className="mt-3 pt-3 px-2">
              <SimplePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  onListPageChange(page)
                }}
              />

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>{filteredCount} bệnh nhân</span>
                <div className="flex items-center gap-1.5">
                  <span>/ trang</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      onRowsPerPageChange(+e.target.value)
                    }}
                    className="border px-2 py-1 rounded h-8 bg-white text-sm"
                  >
                    {[50, 100, 200].map((val) => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedForMerge.length > 0 && (
                <div className="mt-1 text-xs text-blue-600 font-medium">
                  Đã chọn {selectedForMerge.length} để gộp
                </div>
              )}
            </div>
          </div>
        </div>
  );
}
