// Utility tính toán nợ và lãi đơn giản cho toàn bộ ứng dụng

export type DebtStatus = 'đã trả' | 'nợ';

export interface DebtInfo {
  tong: number;        // Tổng tiền của đơn
  paid: number;        // Đã thanh toán
  remaining: number;   // Còn nợ
  status: DebtStatus;  // Trạng thái văn bản
  isDebt: boolean;     // Có đang nợ không
}

export function clampNumber(n: any, fallback = 0) {
  const x = typeof n === 'number' ? n : parseFloat(n);
  return Number.isFinite(x) ? x : fallback;
}

export function calcDebt(tong: any, paid: any): DebtInfo {
  const total = Math.max(0, clampNumber(tong));
  const paidClamped = Math.max(0, Math.min(clampNumber(paid), total));
  const remaining = Math.max(0, total - paidClamped);
  const status: DebtStatus = remaining === 0 ? 'đã trả' : 'nợ';
  return {
    tong: total,
    paid: paidClamped,
    remaining,
    status,
    isDebt: remaining > 0
  };
}

// Tính tổng tiền thuốc từ danh sách chi tiết
export function sumThuoc(list: { soluong: number; giaban: number }[] = []) {
  return list.reduce((s, i) => s + (i.soluong || 0) * (i.giaban || 0), 0);
}

// Tính tổng tiền kính (tròng + gọng)
export function sumKinh(giatrong: any, giagong: any) {
  return clampNumber(giatrong) + clampNumber(giagong);
}

// Tính lợi nhuận chung: doanh thu - giá nhập
export function calcProfit(sell: any, cost: any) {
  return clampNumber(sell) - clampNumber(cost);
}

export function calcKinhProfit(giatrong: any, giagong: any, gianhap_trong: any, gianhap_gong: any) {
  return calcProfit(giatrong, gianhap_trong) + calcProfit(giagong, gianhap_gong);
}

// Chuẩn hoá object trả về cho client (bổ sung con_no)
export function withDebtFields<T extends { tongtien?: number; sotien_da_thanh_toan?: number; giatrong?: number; giagong?: number }>(row: T & Record<string, any>) {
  let total = row.tongtien;
  if (typeof total === 'undefined') {
    // trường hợp đơn kính
    total = (row.giatrong || 0) + (row.giagong || 0);
  }
  const info = calcDebt(total || 0, row.sotien_da_thanh_toan || 0);
  return {
    ...row,
    con_no: info.remaining,
    no: info.isDebt,
    trangthai_thanh_toan: info.status,
  };
}
