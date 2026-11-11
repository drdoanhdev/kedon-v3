import React from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FamilyCard from '@/components/FamilyCard';
import { TRANG_THAI_MAP } from '@/lib/patient/constants';
import type {
  BenhNhan,
  ChainHistory,
  ChiTietDonThuoc,
  DonKinh,
  DonThuoc,
  HenKham,
  PatientNote,
} from '@/lib/patient/types';

export type FilteredDonThuoc = DonThuoc & {
  chiTietList: ChiTietDonThuoc[];
  dienTien: string;
};

export interface PatientRecordTabsProps {
  patient: BenhNhan;
  activeTab: string;
  onTabChange: (tab: string) => void;
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
  showTabBar?: boolean;
}

function historyTabButtonClass(isActive: boolean): string {
  return [
    'px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors',
    isActive
      ? 'bg-white text-blue-700 border border-b-white -mb-[9px] pb-[13px] shadow-sm'
      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
  ].join(' ');
}

export function PatientRecordTabs({
  patient,
  activeTab,
  onTabChange,
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
  showTabBar = true,
}: PatientRecordTabsProps) {
  const patientId = patient.id;

  const content = (
    <div className="max-h-[400px] overflow-y-auto">
      {activeTab === 'don-thuoc' &&
        (filteredDonThuocs.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn thuốc nào.</p>
        ) : (
          <div className="space-y-2">
            {filteredDonThuocs.map((don) => (
              <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="text-xs font-semibold text-gray-800">{don.chandoan || '-'}</span>
                  </div>
                  <span className="text-xs font-bold text-blue-600 whitespace-nowrap ml-2">
                    {(don.tongtien / 1000).toFixed(0)}k
                  </span>
                </div>
                {don.chiTietList.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {don.chiTietList.map((ct, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
                      >
                        {ct.thuoc.tenthuoc} <span className="font-semibold ml-1">×{ct.soluong}</span>
                      </span>
                    ))}
                  </div>
                )}
                {don.dienTien !== '-' && (
                  <div className="text-[11px] text-gray-500 italic">Diễn tiến: {don.dienTien}</div>
                )}
              </div>
            ))}
          </div>
        ))}

      {activeTab === 'don-kinh' &&
        (donKinhs.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn kính nào.</p>
        ) : (
          <div className="space-y-2">
            {donKinhs.map((don) => (
              <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-blue-600">
                      {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k
                    </span>
                    {(() => {
                      const tongTienKinh = (don.giatrong || 0) + (don.giagong || 0);
                      const conNo = tongTienKinh - (don.sotien_da_thanh_toan || 0);
                      return (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            conNo <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {conNo <= 0 ? 'Đã TT' : `Nợ: ${(conNo / 1000).toFixed(0)}k`}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 text-[11px] text-gray-600">
                  <div>
                    <span className="font-medium text-gray-700">MP:</span> {don.sokinh_moi_mp || 'Chưa có'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">MT:</span> {don.sokinh_moi_mt || 'Chưa có'}
                  </div>
                  {don.ten_gong && (
                    <div className="col-span-2 mt-0.5 text-gray-400">Gọng: {don.ten_gong}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

      {activeTab === 'lich-hen' &&
        (henKhams.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Chưa có lịch hẹn nào.</p>
        ) : (
          <div className="space-y-2">
            {henKhams.map((hen) => {
              const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
              return (
                <div key={hen.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {new Date(hen.ngay_hen).toLocaleDateString('vi-VN')}
                        {hen.gio_hen && ` ${hen.gio_hen.substring(0, 5)}`}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                  {hen.ly_do && <div className="text-xs font-semibold text-gray-800 mb-0.5">{hen.ly_do}</div>}
                  {hen.ghichu && <div className="text-[11px] text-gray-500 italic">{hen.ghichu}</div>}
                </div>
              );
            })}
          </div>
        ))}

      {activeTab === 'gia-dinh' && patientId != null && (
        <FamilyCard
          benhnhanId={patientId}
          patientName={patient.ten || ''}
          onSelectMember={onSelectFamilyMember}
        />
      )}

      {activeTab === 'ghi-chu' && (
        <div className="space-y-2">
          {loadingHistoryPatientId === patientId ? (
            <p className="text-xs text-gray-500">Đang tải ghi chú...</p>
          ) : (historyNotesByPatient[patientId!] || []).filter((a) => !a.deleted_at).length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Chưa có ghi chú nào.</p>
          ) : (
            <div className="space-y-2">
              {(historyNotesByPatient[patientId!] || [])
                .filter((a) => !a.deleted_at)
                .map((a) => (
                  <div key={a.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-500">
                        {new Date(a.created_at).toLocaleTimeString('vi-VN')} -{' '}
                        {new Date(a.created_at).toLocaleDateString('vi-VN')}
                      </p>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          a.note_type === 'important'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {a.note_type === 'important' ? 'Quan trọng' : 'Thông thường'}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</p>
                  </div>
                ))}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => openPatientNotesManager(patient)}
          >
            <BellRing className="w-3.5 h-3.5 mr-1" /> Quản lý ghi chú
          </Button>
        </div>
      )}

      {activeTab === 'chuoi' && isMultiBranch && (
        <div className="space-y-3">
          {loadingChainHistory ? (
            <p className="text-xs text-gray-500">Đang tải lịch sử chuỗi...</p>
          ) : !chainHistory ? (
            <p className="text-xs text-gray-400 text-center py-4">Không tải được lịch sử chuỗi.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(chainHistory.by_branch || []).map((b, i) => (
                  <span
                    key={i}
                    className="text-[11px] bg-purple-50 text-purple-800 border border-purple-100 px-2 py-0.5 rounded"
                  >
                    {b.ten}: {b.don_kinh} kính / {b.don_thuoc} thuốc
                  </span>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5">Đơn kính toàn chuỗi</p>
                {(chainHistory.don_kinh || []).slice(0, 30).map((d) => (
                  <div
                    key={d.id}
                    className="bg-white border rounded-lg p-2.5 mb-1.5 text-xs flex justify-between gap-2"
                  >
                    <div>
                      <span className="text-gray-500">
                        {d.ngay_kham ? new Date(d.ngay_kham).toLocaleDateString('vi-VN') : '—'}
                      </span>
                      <span className="ml-2 text-gray-700">
                        MP {d.sph_mp}/{d.cyl_mp} · MT {d.sph_mt}/{d.cyl_mt}
                      </span>
                    </div>
                    <span className="text-purple-700 whitespace-nowrap">
                      {d.branch?.ten_chi_nhanh || '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5">Đơn thuốc toàn chuỗi</p>
                {(chainHistory.don_thuoc || []).slice(0, 30).map((d) => (
                  <div key={d.id} className="bg-white border rounded-lg p-2.5 mb-1.5 text-xs flex justify-between">
                    <span>{d.ngay_kham ? new Date(d.ngay_kham).toLocaleDateString('vi-VN') : '—'}</span>
                    <span className="text-purple-700">{d.branch?.ten_chi_nhanh || '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (!showTabBar) {
    return content;
  }

  return (
    <>
      <div className="flex gap-1 mb-3 border-b pb-2">
        <button
          type="button"
          onClick={() => onTabChange('don-thuoc')}
          className={historyTabButtonClass(activeTab === 'don-thuoc')}
        >
          📋 Đơn thuốc ({filteredDonThuocs.length})
        </button>
        <button
          type="button"
          onClick={() => onTabChange('don-kinh')}
          className={historyTabButtonClass(activeTab === 'don-kinh')}
        >
          👓 Đơn kính ({donKinhs.length})
        </button>
        <button
          type="button"
          onClick={() => onTabChange('lich-hen')}
          className={historyTabButtonClass(activeTab === 'lich-hen')}
        >
          📅 Lịch hẹn ({henKhams.length})
        </button>
        <button
          type="button"
          onClick={() => onTabChange('gia-dinh')}
          className={historyTabButtonClass(activeTab === 'gia-dinh')}
        >
          👨‍👩‍👧‍👦 Gia đình
        </button>
        <button
          type="button"
          onClick={() => onTabChange('ghi-chu')}
          className={historyTabButtonClass(activeTab === 'ghi-chu')}
        >
          📝 Ghi chú
        </button>
        {isMultiBranch && (
          <button
            type="button"
            onClick={() => onTabChange('chuoi')}
            className={historyTabButtonClass(activeTab === 'chuoi')}
          >
            🏬 Chuỗi
          </button>
        )}
      </div>
      {content}
    </>
  );
}
