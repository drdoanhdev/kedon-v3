const { Client } = require('pg');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing connection string.');
  console.error('Usage: node sql/update_enterprise_price.js "postgresql://..."');
  console.error('Or set DATABASE_URL in your environment.');
  process.exit(1);
}

const c = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

c.connect().then(() => c.query(
  "UPDATE subscription_plans SET price = 199000, features = ARRAY['Tất cả tính năng Chuyên nghiệp', 'Quản lý chuỗi cửa hàng', 'Giá: 199K + 79K/chi nhánh thêm', 'Điều chuyển kho giữa chi nhánh', 'Tra cứu khách hàng liên chi nhánh', 'Báo cáo chuỗi tổng hợp', 'Điều chuyển nhân viên', 'Không giới hạn người dùng', 'Hỗ trợ 24/7'] WHERE plan_key = 'enterprise'"
)).then(r => { console.log('OK', r.rowCount); c.end(); }).catch(e => { console.error(e); c.end(); });
