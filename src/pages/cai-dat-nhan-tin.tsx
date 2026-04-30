/**
 * Trang cấu hình "Nhắn tin tự động" — kết nối Zalo OA + quản lý workflow + xem job.
 */
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { Send, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, Power } from 'lucide-react';

interface Channel {
  id: number;
  provider: string;
  status: 'connected' | 'expired' | 'disconnected' | 'error';
  external_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  auto_send: boolean;
  daily_limit: number;
  monthly_limit: number;
  rate_per_minute: number;
  expires_at: string | null;
  last_error: string | null;
  last_refreshed_at: string | null;
}

interface Workflow {
  id: number;
  name: string;
  trigger_event: 'appointment_confirm' | 'appointment_reminder' | 'followup_after_visit';
  offset_minutes: number;
  channel: 'zalo_oa' | 'sms_http';
  template_text: string;
  zns_template_id: string | null;
  enabled: boolean;
}

interface JobRow {
  id: number;
  channel: string;
  recipient_phone: string;
  recipient_name: string | null;
  message_text: string;
  run_at: string;
  status: string;
  attempts: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  appointment_id: number | null;
}

const TRIGGER_LABELS: Record<Workflow['trigger_event'], string> = {
  appointment_confirm: 'Xác nhận khi tạo lịch',
  appointment_reminder: 'Nhắc trước lịch hẹn',
  followup_after_visit: 'Theo dõi sau khám',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  skipped: 'bg-gray-100 text-gray-600',
};

export default function CaiDatNhanTinPage() {
  return (
    <>
      <Header />
      <FeatureGate feature="messaging_automation" permission="manage_messaging">
        <Content />
      </FeatureGate>
    </>
  );
}

export function CaiDatNhanTinSection() {
  return (
    <FeatureGate feature="messaging_automation" permission="manage_messaging">
      <Content />
    </FeatureGate>
  );
}

function Content() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showWfModal, setShowWfModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Workflow> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, w, j] = await Promise.all([
        fetchWithAuth('/api/messaging/channels').then((r) => r.json()),
        fetchWithAuth('/api/messaging/workflows').then((r) => r.json()),
        fetchWithAuth('/api/messaging/jobs').then((r) => r.json()),
      ]);
      setChannels(c.data || []);
      setWorkflows(w.data || []);
      setJobs(j.data || []);
      setCounts(j.counts || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Lắng nghe postMessage từ popup OAuth
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'zalo-oauth') {
        reload();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [reload]);

  const zalo = channels.find((c) => c.provider === 'zalo_oa');

  async function connectZalo() {
    const r = await fetchWithAuth('/api/messaging/zalo/connect-url', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) {
      alert(j.message || 'Không tạo được URL kết nối');
      return;
    }
    const w = window.open(j.url, 'zalo-oauth', 'width=560,height=720');
    if (!w) alert('Trình duyệt chặn cửa sổ popup. Hãy cho phép popup rồi thử lại.');
  }

  async function disconnectZalo() {
    if (!confirm('Ngắt kết nối Zalo OA? Tin nhắn tự động sẽ ngừng gửi.')) return;
    const r = await fetchWithAuth('/api/messaging/channels?provider=zalo_oa', { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json();
      alert(j.message || 'Không ngắt được');
      return;
    }
    reload();
  }

  async function updateChannel(provider: string, patch: Partial<Channel>) {
    const r = await fetchWithAuth('/api/messaging/channels', {
      method: 'PATCH',
      body: JSON.stringify({ provider, ...patch }),
    });
    if (!r.ok) {
      const j = await r.json();
      alert(j.message || 'Lỗi cập nhật');
    }
    reload();
  }

  async function saveWorkflow() {
    if (!editing) return;
    const method = editing.id ? 'PUT' : 'POST';
    const r = await fetchWithAuth('/api/messaging/workflows', {
      method,
      body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j.message || 'Lỗi lưu workflow');
      return;
    }
    setShowWfModal(false);
    setEditing(null);
    reload();
  }

  async function deleteWorkflow(id: number) {
    if (!confirm('Xóa workflow này?')) return;
    const r = await fetchWithAuth(`/api/messaging/workflows?id=${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json();
      alert(j.message || 'Lỗi xóa');
    }
    reload();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Send className="w-6 h-6 text-blue-600" />
            Nhắn tin tự động
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Kết nối Zalo OA và cấu hình quy trình tự động nhắn xác nhận / nhắc lịch hẹn / theo dõi sau khám.
          </p>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Làm mới
        </button>
      </div>

      {/* Card kết nối Zalo */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
              {zalo?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={zalo.avatar_url} alt="OA" className="w-full h-full object-cover" />
              ) : (
                <MessageIcon />
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-800">Zalo Official Account</div>
              <div className="text-sm text-gray-500">
                {zalo?.display_name || (zalo?.status === 'connected' ? 'OA đã kết nối' : 'Chưa kết nối')}
              </div>
              <StatusBadge status={zalo?.status || 'disconnected'} />
              {zalo?.last_error && (
                <div className="text-xs text-red-500 mt-1 max-w-md truncate">⚠ {zalo.last_error}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {zalo?.status === 'connected' ? (
              <>
                <button
                  onClick={connectZalo}
                  className="px-3 py-2 text-sm border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  Kết nối lại
                </button>
                <button
                  onClick={disconnectZalo}
                  className="flex items-center gap-1 px-3 py-2 text-sm border border-red-500 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Power className="w-4 h-4" /> Ngắt
                </button>
              </>
            ) : (
              <button
                onClick={connectZalo}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Kết nối Zalo OA
              </button>
            )}
          </div>
        </div>

        {zalo?.status === 'connected' && (
          <div className="mt-5 pt-5 border-t grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <label className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={zalo.auto_send}
                onChange={(e) => updateChannel('zalo_oa', { auto_send: e.target.checked })}
              />
              Bật gửi tự động
            </label>
            <NumField
              label="Hạn ngạch / ngày"
              value={zalo.daily_limit}
              onSave={(v) => updateChannel('zalo_oa', { daily_limit: v })}
            />
            <NumField
              label="Hạn ngạch / tháng"
              value={zalo.monthly_limit}
              onSave={(v) => updateChannel('zalo_oa', { monthly_limit: v })}
            />
            <NumField
              label="Tin / phút"
              value={zalo.rate_per_minute}
              onSave={(v) => updateChannel('zalo_oa', { rate_per_minute: v })}
            />
          </div>
        )}
      </div>

      {/* Workflows */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">Quy trình tự động</h2>
          <button
            onClick={() => {
              setEditing({
                name: '',
                trigger_event: 'appointment_reminder',
                offset_minutes: -1440,
                channel: 'zalo_oa',
                template_text: 'Chào [Tên], lịch hẹn của bạn là [Ngày] [Giờ] tại [PhongKham]. Vui lòng có mặt đúng giờ.',
                enabled: true,
              });
              setShowWfModal(true);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Thêm workflow
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6">
            Chưa có workflow. Tạo một workflow để tự động gửi tin theo lịch hẹn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2">Sự kiện</th>
                  <th className="px-3 py-2">Lệch (phút)</th>
                  <th className="px-3 py-2">Kênh</th>
                  <th className="px-3 py-2 text-center">Bật</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td className="px-3 py-2 font-medium text-gray-800">{w.name}</td>
                    <td className="px-3 py-2 text-gray-600">{TRIGGER_LABELS[w.trigger_event]}</td>
                    <td className="px-3 py-2 text-gray-600">{w.offset_minutes}</td>
                    <td className="px-3 py-2 text-gray-600">{w.channel}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={w.enabled}
                        onChange={async (e) => {
                          await fetchWithAuth('/api/messaging/workflows', {
                            method: 'PUT',
                            body: JSON.stringify({ id: w.id, enabled: e.target.checked }),
                          });
                          reload();
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => {
                          setEditing(w);
                          setShowWfModal(true);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        Sửa
                      </button>
                      <button onClick={() => deleteWorkflow(w.id)} className="text-red-500 hover:underline">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Jobs gần đây */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">Lịch sử gửi gần đây</h2>
          <div className="text-xs text-gray-500 flex gap-3">
            <span>Đã gửi: <b className="text-green-600">{counts.sent || 0}</b></span>
            <span>Đang chờ: <b className="text-yellow-600">{counts.pending || 0}</b></span>
            <span>Lỗi: <b className="text-red-600">{counts.failed || 0}</b></span>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500 text-center py-4">Đang tải…</div>
        ) : jobs.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">Chưa có job nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Khi nào</th>
                  <th className="px-3 py-2">Người nhận</th>
                  <th className="px-3 py-2">Nội dung</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {new Date(j.run_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {j.recipient_name || j.recipient_phone}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-md truncate">{j.message_text}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[j.status] || 'bg-gray-100'}`}>
                        {j.status}
                      </span>
                      {j.error_message && (
                        <div className="text-xs text-red-500 truncate max-w-xs" title={j.error_message}>
                          {j.error_message}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal workflow */}
      {showWfModal && editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-3">
            <h3 className="font-semibold text-lg">{editing.id ? 'Sửa workflow' : 'Workflow mới'}</h3>
            <Field label="Tên">
              <input
                value={editing.name || ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Sự kiện kích hoạt">
              <select
                value={editing.trigger_event}
                onChange={(e) =>
                  setEditing({ ...editing, trigger_event: e.target.value as Workflow['trigger_event'] })
                }
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="appointment_confirm">Xác nhận khi tạo lịch (gửi ngay)</option>
                <option value="appointment_reminder">Nhắc trước lịch hẹn</option>
                <option value="followup_after_visit">Theo dõi sau khám</option>
              </select>
            </Field>
            <Field label="Lệch thời gian (phút) — âm = trước, dương = sau">
              <input
                type="number"
                value={editing.offset_minutes ?? 0}
                onChange={(e) => setEditing({ ...editing, offset_minutes: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <div className="text-xs text-gray-500 mt-1">
                Vd: -1440 = trước 1 ngày · -120 = trước 2 giờ · 0 = ngay · 4320 = sau 3 ngày.
              </div>
            </Field>
            <Field label="Kênh">
              <select
                value={editing.channel}
                onChange={(e) => setEditing({ ...editing, channel: e.target.value as Workflow['channel'] })}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="zalo_oa">Zalo OA</option>
                <option value="sms_http">SMS (chưa hỗ trợ trong Phase 1)</option>
              </select>
            </Field>
            <Field label="Mã ZNS template (bắt buộc với Zalo proactive)">
              <input
                value={editing.zns_template_id || ''}
                onChange={(e) => setEditing({ ...editing, zns_template_id: e.target.value })}
                placeholder="VD: 257893"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Nội dung mẫu (hỗ trợ [Tên], [Ngày], [Giờ], [PhongKham])">
              <textarea
                value={editing.template_text || ''}
                onChange={(e) => setEditing({ ...editing, template_text: e.target.value })}
                rows={3}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Bật workflow này
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowWfModal(false)} className="px-3 py-2 text-sm border rounded">
                Hủy
              </button>
              <button onClick={saveWorkflow} className="px-3 py-2 text-sm bg-blue-600 text-white rounded">
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageIcon() {
  return <Send className="w-6 h-6 text-blue-600" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
        <CheckCircle2 className="w-3 h-3" /> Đã kết nối
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
        <AlertCircle className="w-3 h-3" /> Token hết hạn
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
        <AlertCircle className="w-3 h-3" /> Lỗi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
      Chưa kết nối
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onBlur={() => v !== value && onSave(v)}
        className="w-full border rounded px-2 py-1 text-sm"
      />
    </div>
  );
}
