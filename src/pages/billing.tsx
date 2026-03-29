import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';

interface TrialInfo {
  plan: string;
  trial: {
    startDate: string;
    endDate: string;
    daysRemaining: number;
    totalDays: number;
    usedPrescriptions: number;
    maxPrescriptions: number;
    prescriptionsRemaining: number;
    isExpired: boolean;
  };
  planExpiresAt: string | null;
}

interface PaymentOrder {
  id: string;
  plan: string;
  amount: number;
  months: number;
  transfer_code: string;
  status: string;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
}

interface PaymentData {
  order: PaymentOrder;
  bankInfo: { bankId: string; bankName: string; accountNo: string; accountName: string };
  qrUrl: string;
  transferContent: string;
}

interface Plan {
  name: string;
  key: string;
  price: string;
  priceNum: number;
  period: string;
  features: string[];
  popular?: boolean;
}

const FALLBACK_PLANS: Plan[] = [
  {
    name: 'Dùng thử', key: 'trial', price: 'Miễn phí', priceNum: 0,
    period: '3 tháng hoặc 1.000 đơn',
    features: ['Quản lý bệnh nhân', 'Kê đơn thuốc & kính', 'Báo cáo cơ bản', '1 người dùng'],
  },
  {
    name: 'Cơ bản', key: 'basic', price: '299.000đ', priceNum: 299000, period: '/tháng',
    features: ['Tất cả tính năng Trial', 'Đơn thuốc không giới hạn', 'Tối đa 3 người dùng', 'Hỗ trợ email'],
  },
  {
    name: 'Chuyên nghiệp', key: 'pro', price: '599.000đ', priceNum: 599000, period: '/tháng',
    features: ['Tất cả tính năng Cơ bản', 'Nhân viên không giới hạn', 'Báo cáo nâng cao', 'Nhận diện khuôn mặt', 'Hỗ trợ ưu tiên'],
    popular: true,
  },
];

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

export default function BillingPage() {
  const router = useRouter();
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [paymentHistory, setPaymentHistory] = useState<PaymentOrder[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [creating, setCreating] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error' | 'cancel'; text: string } | null>(null);
  const sepayFormRef = useRef<HTMLFormElement>(null);
  const [sepayCheckout, setSepayCheckout] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const { currentTenantId, currentTenant } = useAuth();

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants/plans');
      if (res.ok) {
        const data = await res.json();
        if (data.data?.length) {
          setPlans(data.data.map((p: any) => ({
            name: p.name,
            key: p.plan_key,
            price: p.price === 0 ? 'Miễn phí' : formatVND(p.price),
            priceNum: p.price,
            period: p.period_label,
            features: p.features || [],
            popular: p.is_popular,
          })));
        }
      }
    } catch {}
  }, []);

  const fetchTrial = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants/trial', { headers });
      if (res.ok) setTrial(await res.json());
    } catch {}
  }, [currentTenantId]);

  const fetchPayments = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants/payment', { headers });
      if (res.ok) {
        const data = await res.json();
        setPaymentHistory(data.history || []);
        // Không tự show QR popup nữa - đã chuyển sang SePay checkout
      }
    } catch {}
  }, [currentTenantId]);

  useEffect(() => {
    Promise.all([fetchTrial(), fetchPayments(), fetchPlans()]).finally(() => setLoading(false));
  }, [fetchTrial, fetchPayments, fetchPlans]);

  const handleUpgrade = async (planKey: string) => {
    setSelectedPlan(planKey);
    setSelectedMonths(1);
  };

  const handleCreateOrder = async () => {
    if (!selectedPlan) return;
    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tenants/sepay-checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan: selectedPlan, months: selectedMonths }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Lỗi tạo đơn thanh toán');
        return;
      }
      // SePay checkout: set form data and auto-submit
      setSepayCheckout({ url: data.checkoutURL, fields: data.checkoutFields });
      setSelectedPlan(null);
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setCreating(false);
    }
  };

  // Auto-submit SePay form when checkout data is ready
  useEffect(() => {
    if (sepayCheckout && sepayFormRef.current) {
      sepayFormRef.current.submit();
    }
  }, [sepayCheckout]);

  // Handle SePay callback URL params
  useEffect(() => {
    const { payment, order } = router.query;
    if (!payment) return;

    if (payment === 'success') {
      setPaymentMessage({ type: 'success', text: `Thanh toán thành công! Đơn ${order || ''} đang được kích hoạt.` });
      fetchTrial();
      fetchPayments();
    } else if (payment === 'error') {
      setPaymentMessage({ type: 'error', text: `Thanh toán thất bại cho đơn ${order || ''}. Vui lòng thử lại.` });
    } else if (payment === 'cancel') {
      setPaymentMessage({ type: 'cancel', text: 'Bạn đã hủy thanh toán. Có thể thử lại bất kỳ lúc nào.' });
    }

    // Clean URL params
    router.replace('/billing', undefined, { shallow: true });
  }, [router.query]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-5xl mx-auto py-8 px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Quản lý gói dịch vụ</h1>
            <p className="text-gray-600 mt-1">
              {currentTenant?.name || 'Phòng khám của bạn'}
            </p>
          </div>

          {/* SePay hidden checkout form */}
          {sepayCheckout && (
            <form ref={sepayFormRef} action={sepayCheckout.url} method="POST" style={{ display: 'none' }}>
              {Object.entries(sepayCheckout.fields).map(([field, value]) => (
                <input key={field} type="hidden" name={field} value={value} />
              ))}
            </form>
          )}

          {/* Payment callback message */}
          {paymentMessage && (
            <div className={`rounded-xl p-4 mb-6 flex items-center justify-between ${
              paymentMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
              paymentMessage.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
              'bg-yellow-50 border border-yellow-200 text-yellow-800'
            }`}>
              <p className="text-sm font-medium">
                {paymentMessage.type === 'success' ? '🎉' : paymentMessage.type === 'error' ? '❌' : '⚠️'}{' '}
                {paymentMessage.text}
              </p>
              <button onClick={() => setPaymentMessage(null)} className="text-lg ml-4 opacity-60 hover:opacity-100">×</button>
            </div>
          )}

          {/* Current plan status */}
          {trial && trial.plan === 'trial' && (
            <div className={`rounded-xl p-6 mb-8 ${trial.trial.isExpired ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {trial.trial.isExpired ? '⚠️' : '📊'} Trạng thái gói dùng thử
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500">Ngày còn lại</p>
                  <p className={`text-3xl font-bold ${trial.trial.daysRemaining > 30 ? 'text-blue-700' : trial.trial.daysRemaining > 7 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {trial.trial.daysRemaining}
                  </p>
                  <p className="text-xs text-gray-400">/ {trial.trial.totalDays} ngày</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500">Đơn đã dùng</p>
                  <p className="text-3xl font-bold text-indigo-700">{trial.trial.usedPrescriptions}</p>
                  <p className="text-xs text-gray-400">/ {trial.trial.maxPrescriptions} đơn</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500">Ngày hết hạn</p>
                  <p className="text-lg font-bold text-gray-800">
                    {new Date(trial.trial.endDate).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>
              {trial.trial.isExpired && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg text-red-800 text-sm">
                  Gói dùng thử đã hết hạn. Vui lòng nâng cấp để tiếp tục sử dụng.
                </div>
              )}
            </div>
          )}

          {trial && trial.plan !== 'trial' && (
            <div className="rounded-xl p-6 mb-8 bg-green-50 border border-green-200">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                ✅ Gói {trial.plan === 'pro' ? 'Chuyên nghiệp' : 'Cơ bản'}
              </h2>
              <p className="text-green-800 text-sm">
                Đang hoạt động. Hạn sử dụng: <span className="font-semibold">
                  {trial.planExpiresAt ? new Date(trial.planExpiresAt).toLocaleDateString('vi-VN') : 'Không giới hạn'}
                </span>
              </p>
            </div>
          )}

          {/* Plan selection modal */}
          {selectedPlan && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Nâng cấp gói {selectedPlan === 'pro' ? 'Chuyên nghiệp' : 'Cơ bản'}
                </h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Số tháng</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 3, 6, 12].map((m) => (
                      <button
                        key={m}
                        onClick={() => setSelectedMonths(m)}
                        className={`py-2 rounded-lg text-sm font-medium transition ${
                          selectedMonths === m
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {m} tháng
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600">Đơn giá</span>
                    <span>{formatVND(plans.find(p => p.key === selectedPlan)?.priceNum || 0)}/tháng</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600">Số tháng</span>
                    <span>× {selectedMonths}</span>
                  </div>
                  {selectedMonths >= 6 && (
                    <div className="flex justify-between items-center text-sm text-green-600 mb-1">
                      <span>🎁 Ưu đãi</span>
                      <span>Miễn phí hỗ trợ ưu tiên</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="font-semibold">Tổng cộng</span>
                    <span className="text-xl font-bold text-blue-700">
                      {formatVND((plans.find(p => p.key === selectedPlan)?.priceNum || 0) * selectedMonths)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedPlan(null)}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleCreateOrder}
                    disabled={creating}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {creating ? 'Đang tạo...' : 'Thanh toán qua SePay'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map((plan) => {
              const isCurrent = trial?.plan === plan.key;
              return (
                <div
                  key={plan.key}
                  className={`relative bg-white rounded-2xl shadow-lg p-6 border-2 transition-all ${
                    plan.popular
                      ? 'border-purple-400 shadow-purple-100'
                      : isCurrent
                      ? 'border-blue-400'
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Phổ biến nhất
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Gói hiện tại
                    </div>
                  )}
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <div className="mt-3">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {plan.period && (
                        <span className="text-gray-500 text-sm">{plan.period}</span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500 mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 font-medium cursor-default"
                    >
                      Đang sử dụng
                    </button>
                  ) : plan.key === 'trial' ? (
                    <div className="w-full py-2.5 rounded-xl bg-gray-50 text-gray-400 font-medium text-center text-sm">
                      Chỉ dùng khi đăng ký mới
                    </div>
                  ) : (
                    <button
                      className={`w-full py-2.5 rounded-xl font-medium transition ${
                        plan.popular
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      onClick={() => handleUpgrade(plan.key)}
                    >
                      Nâng cấp
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment history */}
          {paymentHistory.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Lịch sử thanh toán</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Ngày</th>
                      <th className="pb-2 font-medium">Gói</th>
                      <th className="pb-2 font-medium">Thời hạn</th>
                      <th className="pb-2 font-medium text-right">Số tiền</th>
                      <th className="pb-2 font-medium text-center">Mã GD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString('vi-VN') : '-'}</td>
                        <td className="py-2">{p.plan === 'pro' ? 'Chuyên nghiệp' : 'Cơ bản'}</td>
                        <td className="py-2">{p.months} tháng</td>
                        <td className="py-2 text-right font-medium">{formatVND(p.amount)}</td>
                        <td className="py-2 text-center font-mono text-xs text-gray-500">{p.transfer_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Contact */}
          <div className="bg-white rounded-xl p-6 shadow-sm border text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cần hỗ trợ?</h3>
            <p className="text-gray-600 text-sm mb-4">
              Liên hệ với chúng tôi để được tư vấn gói phù hợp hoặc hỗ trợ thanh toán.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="tel:0912345678"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-sm font-medium"
              >
                📞 Gọi điện
              </a>
              <a
                href="mailto:support@kedon.vn"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium"
              >
                ✉️ Email
              </a>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Quay lại Dashboard
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
