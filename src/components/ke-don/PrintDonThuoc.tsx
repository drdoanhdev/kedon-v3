import React, { useRef } from 'react';

interface PrintConfig {
  ten_cua_hang: string;
  dia_chi: string;
  dien_thoai: string;
  logo_url: string;
  hien_thi_logo_thuoc: boolean;
  hien_thi_chan_doan_thuoc: boolean;
  hien_thi_gia_thuoc: boolean;
  hien_thi_ghi_chu_thuoc: boolean;
  ghi_chu_cuoi_thuoc: string;
}

interface ChiTietThuoc {
  thuoc: {
    tenthuoc: string;
    donvitinh: string;
    giaban: number;
  };
  soluong: number;
  cachdung: string;
}

interface BenhNhanData {
  ten: string;
  namsinh?: string;
  dienthoai?: string;
  diachi?: string;
}

interface PrintDonThuocProps {
  config: PrintConfig;
  chandoan: string;
  ngayKham: string;
  dsThuoc: ChiTietThuoc[];
  benhNhan: BenhNhanData;
  tongTien: number;
  ghiChu?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const PrintDonThuoc: React.FC<PrintDonThuocProps> = ({ config, chandoan, ngayKham, dsThuoc, benhNhan, tongTien, ghiChu }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Không mở được cửa sổ in. Hãy cho phép popup.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Đơn thuốc - ${benhNhan.ten}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 20px; }
        .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 12px; }
        .header .logo { max-height: 60px; max-width: 200px; margin-bottom: 6px; }
        .header .shop-name { font-size: 18px; font-weight: bold; text-transform: uppercase; }
        .header .shop-info { font-size: 11px; color: #555; margin-top: 2px; }
        .patient-info { margin-bottom: 12px; }
        .patient-info table { width: 100%; }
        .patient-info td { padding: 2px 8px 2px 0; font-size: 13px; }
        .patient-info .label { font-weight: 600; white-space: nowrap; width: 80px; }
        .title { text-align: center; font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 12px 0; }
        table.prescription { width: 100%; border-collapse: collapse; margin: 8px 0; }
        table.prescription th, table.prescription td { border: 1px solid #333; padding: 5px 8px; font-size: 13px; }
        table.prescription th { background: #f0f0f0; font-weight: 600; font-size: 12px; text-align: center; }
        table.prescription td { text-align: left; }
        table.prescription td.center { text-align: center; }
        table.prescription td.right { text-align: right; }
        .total-section { margin: 10px 0; border-top: 1px solid #ccc; padding-top: 8px; }
        .total-section table { width: 100%; }
        .total-section td { padding: 2px 8px 2px 0; font-size: 13px; }
        .total-section .label { font-weight: 600; }
        .total-section .amount { text-align: right; font-weight: 600; }
        .notes { margin: 10px 0; font-size: 12px; }
        .notes .label { font-weight: 600; }
        .footer-note { margin-top: 16px; text-align: center; font-style: italic; font-size: 11px; color: #666; border-top: 1px dashed #ccc; padding-top: 8px; }
        @media print {
          body { padding: 0; }
          @page { margin: 10mm; size: A5; }
        }
      </style>
      </head><body>${content.innerHTML}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}<\/script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePrint}
        className="bg-white border border-gray-300 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-gray-50 touch-manipulation flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        In đơn
      </button>

      {/* Hidden print content */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            {config.hien_thi_logo_thuoc && config.logo_url && (
              <img src={config.logo_url} alt="Logo" className="logo" style={{ maxHeight: 60, maxWidth: 200, margin: '0 auto 6px' }} />
            )}
            {config.ten_cua_hang && <div className="shop-name">{config.ten_cua_hang}</div>}
            {(config.dia_chi || config.dien_thoai) && (
              <div className="shop-info">
                {config.dia_chi && <span>{config.dia_chi}</span>}
                {config.dia_chi && config.dien_thoai && <span> &bull; </span>}
                {config.dien_thoai && <span>ĐT: {config.dien_thoai}</span>}
              </div>
            )}
          </div>

          <div className="title">Đơn thuốc</div>

          {/* Patient info */}
          <div className="patient-info">
            <table>
              <tbody>
                <tr>
                  <td className="label">Họ tên:</td>
                  <td style={{ fontWeight: 600 }}>{benhNhan.ten}</td>
                  <td className="label">Năm sinh:</td>
                  <td>{benhNhan.namsinh || ''}</td>
                </tr>
                <tr>
                  <td className="label">Ngày khám:</td>
                  <td>{formatDate(ngayKham)}</td>
                  {benhNhan.dienthoai && (
                    <>
                      <td className="label">ĐT:</td>
                      <td>{benhNhan.dienthoai}</td>
                    </>
                  )}
                </tr>
                {benhNhan.diachi && (
                  <tr>
                    <td className="label">Địa chỉ:</td>
                    <td colSpan={3}>{benhNhan.diachi}</td>
                  </tr>
                )}
                {config.hien_thi_chan_doan_thuoc && chandoan && (
                  <tr>
                    <td className="label">Chẩn đoán:</td>
                    <td colSpan={3}>{chandoan}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Prescription table */}
          <table className="prescription">
            <thead>
              <tr>
                <th style={{ width: 30 }}>STT</th>
                <th>Tên thuốc</th>
                <th style={{ width: 60 }}>SL</th>
                <th style={{ width: 60 }}>ĐVT</th>
                <th>Cách dùng</th>
                {config.hien_thi_gia_thuoc && <th style={{ width: 80 }}>Đơn giá</th>}
                {config.hien_thi_gia_thuoc && <th style={{ width: 90 }}>Thành tiền</th>}
              </tr>
            </thead>
            <tbody>
              {dsThuoc.map((item, idx) => (
                <tr key={idx}>
                  <td className="center">{idx + 1}</td>
                  <td>{item.thuoc.tenthuoc}</td>
                  <td className="center">{item.soluong}</td>
                  <td className="center">{item.thuoc.donvitinh}</td>
                  <td>{item.cachdung}</td>
                  {config.hien_thi_gia_thuoc && <td className="right">{item.thuoc.giaban.toLocaleString()}đ</td>}
                  {config.hien_thi_gia_thuoc && <td className="right">{(item.thuoc.giaban * item.soluong).toLocaleString()}đ</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          {config.hien_thi_gia_thuoc && tongTien > 0 && (
            <div className="total-section">
              <table>
                <tbody>
                  <tr>
                    <td className="label" style={{ fontSize: 14 }}>Tổng cộng:</td>
                    <td className="amount" style={{ fontSize: 14 }}>{tongTien.toLocaleString()}đ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {config.hien_thi_ghi_chu_thuoc && ghiChu && (
            <div className="notes">
              <span className="label">Ghi chú: </span>{ghiChu}
            </div>
          )}

          {/* Footer note */}
          {config.ghi_chu_cuoi_thuoc && (
            <div className="footer-note">{config.ghi_chu_cuoi_thuoc}</div>
          )}
        </div>
      </div>
    </>
  );
};

export default PrintDonThuoc;
