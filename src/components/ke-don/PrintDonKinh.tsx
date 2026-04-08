import React, { useRef } from 'react';

interface PrintConfig {
  ten_cua_hang: string;
  dia_chi: string;
  dien_thoai: string;
  logo_url: string;
  hien_thi_logo: boolean;
  hien_thi_chan_doan: boolean;
  hien_thi_sokinh_cu: boolean;
  hien_thi_thiluc: boolean;
  hien_thi_pd: boolean;
  hien_thi_gong: boolean;
  hien_thi_trong: boolean;
  hien_thi_gia: boolean;
  hien_thi_ghi_chu: boolean;
  ghi_chu_cuoi: string;
  chuc_danh_nguoi_ky: string;
  ho_ten_nguoi_ky: string;
  chu_ky_url: string;
  hien_thi_nguoi_ky: boolean;
  hien_thi_ngay_kham: boolean;
}

interface DonKinhData {
  ngaykham?: string;
  chandoan?: string;
  ghichu?: string;
  thiluc_khongkinh_mp?: string;
  thiluc_kinhcu_mp?: string;
  thiluc_kinhmoi_mp?: string;
  sokinh_cu_mp?: string;
  sokinh_moi_mp?: string;
  thiluc_khongkinh_mt?: string;
  thiluc_kinhcu_mt?: string;
  thiluc_kinhmoi_mt?: string;
  sokinh_cu_mt?: string;
  sokinh_moi_mt?: string;
  pd_mp?: string;
  pd_mt?: string;
  ten_gong?: string;
  hangtrong_mp?: string;
  hangtrong_mt?: string;
  giatrong?: number;
  giagong?: number;
}

interface BenhNhanData {
  ten: string;
  namsinh?: string;
  dienthoai?: string;
  diachi?: string;
}

interface PrintDonKinhProps {
  config: PrintConfig;
  don: DonKinhData;
  benhNhan: BenhNhanData;
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

const PrintDonKinh: React.FC<PrintDonKinhProps> = ({ config, don, benhNhan }) => {
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
      <html><head><title>Đơn kính - ${benhNhan.ten}</title>
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
        table.prescription th, table.prescription td { border: 1px solid #333; padding: 5px 8px; text-align: center; font-size: 13px; }
        table.prescription th { background: #f0f0f0; font-weight: 600; font-size: 12px; }
        table.prescription td.label-cell { font-weight: 600; text-align: left; background: #fafafa; }
        .products { margin: 10px 0; }
        .products table { width: 100%; }
        .products td { padding: 2px 8px 2px 0; font-size: 13px; }
        .products .label { font-weight: 600; width: 100px; }
        .price-section { margin: 10px 0; border-top: 1px solid #ccc; padding-top: 8px; }
        .price-section table { width: 100%; }
        .price-section td { padding: 2px 8px 2px 0; font-size: 13px; }
        .price-section .label { font-weight: 600; }
        .price-section .amount { text-align: right; font-weight: 600; }
        .notes { margin: 10px 0; font-size: 12px; }
        .notes .label { font-weight: 600; }
        .footer-note { margin-top: 16px; text-align: center; font-style: italic; font-size: 11px; color: #666; border-top: 1px dashed #ccc; padding-top: 8px; }
        .signer-section { margin-top: 20px; display: flex; justify-content: flex-end; }
        .signer-section .signer-inner { text-align: center; min-width: 180px; }
        .signer-section .signer-title { font-weight: 600; font-size: 13px; }
        .signer-section .signer-signature { margin: 8px 0; min-height: 50px; }
        .signer-section .signer-signature img { max-height: 60px; max-width: 180px; }
        .signer-section .signer-name { font-weight: 600; font-size: 13px; }
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

  const showThiLuc = config.hien_thi_thiluc;
  const showSoKinhCu = config.hien_thi_sokinh_cu;
  const showPd = config.hien_thi_pd;

  return (
    <>
      <button
        type="button"
        onClick={handlePrint}
        className="bg-white border border-gray-300 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-gray-50 touch-manipulation flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        In
      </button>

      {/* Hidden print content */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            {config.hien_thi_logo && config.logo_url && (
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

          <div className="title">Phiếu đơn kính</div>

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
                {(config.hien_thi_ngay_kham ?? true) && (
                <tr>
                  <td className="label">Ngày đo:</td>
                  <td>{formatDate(don.ngaykham)}</td>
                  {benhNhan.dienthoai && (
                    <>
                      <td className="label">ĐT:</td>
                      <td>{benhNhan.dienthoai}</td>
                    </>
                  )}
                </tr>
                )}
                {config.hien_thi_chan_doan && don.chandoan && (
                  <tr>
                    <td className="label">Chẩn đoán:</td>
                    <td colSpan={3}>{don.chandoan}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Prescription table */}
          <table className="prescription">
            <thead>
              <tr>
                <th style={{ width: 40 }}>Mắt</th>
                {showThiLuc && <th>TL KK</th>}
                {showThiLuc && <th>TL cũ</th>}
                {showThiLuc && <th>TL mới</th>}
                {showSoKinhCu && <th>Số kính cũ</th>}
                <th>Số kính mới</th>
                {showPd && <th>PD/2</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>MP</td>
                {showThiLuc && <td>{don.thiluc_khongkinh_mp || ''}</td>}
                {showThiLuc && <td>{don.thiluc_kinhcu_mp || ''}</td>}
                {showThiLuc && <td>{don.thiluc_kinhmoi_mp || ''}</td>}
                {showSoKinhCu && <td>{don.sokinh_cu_mp || ''}</td>}
                <td style={{ fontWeight: 600 }}>{don.sokinh_moi_mp || ''}</td>
                {showPd && <td>{don.pd_mp || ''}</td>}
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>MT</td>
                {showThiLuc && <td>{don.thiluc_khongkinh_mt || ''}</td>}
                {showThiLuc && <td>{don.thiluc_kinhcu_mt || ''}</td>}
                {showThiLuc && <td>{don.thiluc_kinhmoi_mt || ''}</td>}
                {showSoKinhCu && <td>{don.sokinh_cu_mt || ''}</td>}
                <td style={{ fontWeight: 600 }}>{don.sokinh_moi_mt || ''}</td>
                {showPd && <td>{don.pd_mt || ''}</td>}
              </tr>
            </tbody>
          </table>

          {/* Products */}
          {(config.hien_thi_gong || config.hien_thi_trong) && (
            <div className="products">
              <table>
                <tbody>
                  {config.hien_thi_gong && don.ten_gong && (
                    <tr>
                      <td className="label">Gọng:</td>
                      <td>{don.ten_gong}</td>
                    </tr>
                  )}
                  {config.hien_thi_trong && don.hangtrong_mp && (
                    <tr>
                      <td className="label">Tròng MP:</td>
                      <td>{don.hangtrong_mp}</td>
                    </tr>
                  )}
                  {config.hien_thi_trong && don.hangtrong_mt && don.hangtrong_mt !== don.hangtrong_mp && (
                    <tr>
                      <td className="label">Tròng MT:</td>
                      <td>{don.hangtrong_mt}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Price */}
          {config.hien_thi_gia && (don.giatrong || don.giagong) && (
            <div className="price-section">
              <table>
                <tbody>
                  {don.giatrong ? (
                    <tr><td className="label">Giá tròng:</td><td className="amount">{don.giatrong.toLocaleString()}đ</td></tr>
                  ) : null}
                  {don.giagong ? (
                    <tr><td className="label">Giá gọng:</td><td className="amount">{don.giagong.toLocaleString()}đ</td></tr>
                  ) : null}
                  <tr>
                    <td className="label" style={{ fontSize: 14 }}>Tổng cộng:</td>
                    <td className="amount" style={{ fontSize: 14 }}>{((don.giatrong || 0) + (don.giagong || 0)).toLocaleString()}đ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {config.hien_thi_ghi_chu && don.ghichu && (
            <div className="notes">
              <span className="label">Ghi chú: </span>{don.ghichu}
            </div>
          )}

          {/* Footer note */}
          {config.ghi_chu_cuoi && (
            <div className="footer-note">{config.ghi_chu_cuoi}</div>
          )}

          {/* Signer section */}
          {(config.hien_thi_nguoi_ky ?? true) && (config.chuc_danh_nguoi_ky || config.ho_ten_nguoi_ky || config.chu_ky_url) && (
            <div className="signer-section">
              <div className="signer-inner">
                {config.chuc_danh_nguoi_ky && <div className="signer-title">{config.chuc_danh_nguoi_ky}</div>}
                <div className="signer-signature">
                  {config.chu_ky_url && <img src={config.chu_ky_url} alt="Chữ ký" />}
                </div>
                {config.ho_ten_nguoi_ky && <div className="signer-name">{config.ho_ten_nguoi_ky}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PrintDonKinh;
