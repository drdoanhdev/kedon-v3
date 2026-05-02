import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { AlertTriangle, History, Settings, Check, X, TrendingUp, RefreshCw } from 'lucide-react';

type SubTab = 'alerts' | 'history';

interface Suggestion {
  id: number;
  item_type: string;
  item_id: number;
  item_name?: string;
  old_cost: number;
  new_cost: number;
  cost_increase_pct: number;
  current_sell_price: number;
  suggested_sell_price: number;
  status: string;
  created_at: string;
}

interface PriceHistoryRow {
  id: number;
  kind: 'ban' | 'von';
  old_price: number | null;
  new_price: number;
  source: string;
  reason: string | null;
  created_at: string;
}

interface AlertConfig {
  threshold_cost_increase_pct: number;
  enabled_for_thuoc: boolean;
  enabled_for_hang_trong: boolean;
  margin_keep_mode: 'percent' | 'absolute';
  round_to: number;
}

interface ThuocLite { id: number; tenthuoc: string | null; donvitinh: string | null; giaban?: number; gianhap?: number; }

const fmt = (v: number | null | undefined) => (v == null ? '-' : Number(v).toLocaleString('vi-VN') + 'đ');
const fmtDate = (d: string) => new Date(d).toLocaleString('vi-VN', { hour12: false });

const sourceLabel = (s: string) => {
  const map: Record<string, string> = {
    auto_import: 'Tự động (nhập kho)',
    manual: 'Sửa thủ công',
    suggestion_applied: 'Áp dụng đề xuất',
    backfill: 'Khởi tạo',
  };
  return map[s] || s;
};

export default function PricingTab({ thuocList }: { thuocList: ThuocLite[] }) {
  const [subTab, setSubTab] = useState<SubTab>('alerts');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingSug, setLoadingSug] = useState(false);

  const [selectedThuocId, setSelectedThuocId] = useState<number | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AlertConfig>({
    threshold_cost_increase_pct: 20,
    enabled_for_thuoc: true,
    enabled_for_hang_trong: false,
    margin_keep_mode: 'percent',
    round_to: 1000,
  });
  const [savingCfg, setSavingCfg] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoadingSug(true);
    try {
      const { data } = await axios.get('/api/pricing/suggestions');
      setSuggestions(data.data || []);
      setPendingCount(data.pending_count || 0);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi tải đề xuất');
    } finally {
      setLoadingSug(false);
    }
  }, []);

  const fetchHistory = useCallback(async (thuocId: number) => {
    setLoadingHist(true);
    try {
      const { data } = await axios.get('/api/pricing/history', {
        params: { item_type: 'thuoc', item_id: thuocId },
      });
      setHistory(data.data || []);
    } catch (e: any) {
      toast.error('Lỗi tải lịch sử giá');
    } finally {
      setLoadingHist(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/pricing/alert-config');
      if (data.data) setConfig({
        threshold_cost_increase_pct: Number(data.data.threshold_cost_increase_pct ?? 20),
        enabled_for_thuoc: !!data.data.enabled_for_thuoc,
        enabled_for_hang_trong: !!data.data.enabled_for_hang_trong,
        margin_keep_mode: data.data.margin_keep_mode || 'percent',
        round_to: Number(data.data.round_to ?? 1000),
      });
    } catch {}
  }, []);

  useEffect(() => { fetchSuggestions(); fetchConfig(); }, [fetchSuggestions, fetchConfig]);

  useEffect(() => {
    if (selectedThuocId) fetchHistory(selectedThuocId);
    else setHistory([]);
  }, [selectedThuocId, fetchHistory]);

  const applySuggestion = async (s: Suggestion) => {
    if (!confirm(`Áp dụng giá bán mới ${fmt(s.suggested_sell_price)} cho "${s.item_name}"?`)) return;
    try {
      await axios.post(`/api/pricing/suggestions/${s.id}?action=apply`);
      toast.success('Đã áp dụng đề xuất');
      fetchSuggestions();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi áp dụng');
    }
  };

  const dismissSuggestion = async (s: Suggestion) => {
    if (!confirm(`Bỏ qua đề xuất tăng giá cho "${s.item_name}"?`)) return;
    try {
      await axios.post(`/api/pricing/suggestions/${s.id}?action=dismiss`);
      toast.success('Đã bỏ qua đề xuất');
      fetchSuggestions();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi bỏ qua');
    }
  };

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await axios.put('/api/pricing/alert-config', config);
      toast.success('Đã lưu cấu hình');
      setShowConfig(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi lưu cấu hình');
    } finally {
      setSavingCfg(false);
    }
  };

  const filteredThuoc = thuocList.filter(t =>
    !historySearch || (t.tenthuoc || '').toLowerCase().includes(historySearch.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="space-y-4">
      {/* Sub-tab header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border">
          <button
            onClick={() => setSubTab('alerts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              subTab === 'alerts' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Cảnh báo
            {pendingCount > 0 && (
              <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded-full ${subTab === 'alerts' ? 'bg-white text-red-600' : 'bg-red-100 text-red-700'}`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              subTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <History className="w-4 h-4" />
            Lịch sử giá
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchSuggestions(); if (selectedThuocId) fetchHistory(selectedThuocId); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Làm mới
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings className="w-4 h-4 mr-1" /> Cấu hình ngưỡng
          </Button>
        </div>
      </div>

      {/* TAB: Cảnh báo */}
      {subTab === 'alerts' && (
        <Card>
          <CardContent className="p-4">
            {loadingSug ? (
              <p className="text-center py-10 text-gray-500">Đang tải...</p>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="font-semibold">Không có cảnh báo</p>
                <p className="text-sm mt-1">Tất cả mặt hàng đang ổn định. Ngưỡng cảnh báo hiện tại: <b>{config.threshold_cost_increase_pct}%</b></p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500 border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Mặt hàng</th>
                      <th className="text-right py-2 px-2">Vốn cũ</th>
                      <th className="text-right py-2 px-2">Vốn mới</th>
                      <th className="text-right py-2 px-2">Tăng %</th>
                      <th className="text-right py-2 px-2">Bán hiện</th>
                      <th className="text-right py-2 px-2">Bán đề xuất</th>
                      <th className="text-center py-2 px-2">Phát sinh</th>
                      <th className="text-center py-2 px-2">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map(s => {
                      const sev = s.cost_increase_pct >= 50 ? 'bg-red-100 text-red-700' : s.cost_increase_pct >= 30 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700';
                      return (
                        <tr key={s.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium">{s.item_name}</td>
                          <td className="text-right px-2">{fmt(s.old_cost)}</td>
                          <td className="text-right px-2 font-semibold">{fmt(s.new_cost)}</td>
                          <td className="text-right px-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sev}`}>+{s.cost_increase_pct}%</span>
                          </td>
                          <td className="text-right px-2">{fmt(s.current_sell_price)}</td>
                          <td className="text-right px-2 font-bold text-blue-700">{fmt(s.suggested_sell_price)}</td>
                          <td className="text-center px-2 text-xs text-gray-500">{fmtDate(s.created_at)}</td>
                          <td className="text-center px-2">
                            <div className="flex gap-1 justify-center">
                              <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-700" onClick={() => applySuggestion(s)}>
                                <Check className="w-3.5 h-3.5 mr-1" /> Áp dụng
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => dismissSuggestion(s)}>
                                <X className="w-3.5 h-3.5 mr-1" /> Bỏ qua
                              </Button>
                            </div>
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
      )}

      {/* TAB: Lịch sử */}
      {subTab === 'history' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Drug picker */}
          <Card className="md:col-span-1">
            <CardContent className="p-3">
              <Input
                placeholder="Tìm thuốc..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-[500px] overflow-y-auto space-y-1">
                {filteredThuoc.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Không có thuốc</p>
                )}
                {filteredThuoc.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedThuocId(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                      selectedThuocId === t.id ? 'bg-blue-100 text-blue-800 font-semibold' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="truncate">{t.tenthuoc}</div>
                    <div className="text-xs text-gray-500 flex justify-between">
                      <span>Bán: {fmt(t.giaban)}</span>
                      <span>Vốn: {fmt(t.gianhap)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* History list */}
          <Card className="md:col-span-2">
            <CardContent className="p-3">
              {!selectedThuocId ? (
                <p className="text-center py-10 text-gray-400 text-sm">Chọn một thuốc để xem lịch sử giá</p>
              ) : loadingHist ? (
                <p className="text-center py-10 text-gray-500">Đang tải...</p>
              ) : history.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">Chưa có lịch sử thay đổi giá</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500 border-b">
                      <tr>
                        <th className="text-left py-2 px-2">Thời điểm</th>
                        <th className="text-center py-2 px-2">Loại</th>
                        <th className="text-right py-2 px-2">Giá cũ</th>
                        <th className="text-right py-2 px-2">Giá mới</th>
                        <th className="text-left py-2 px-2">Nguồn</th>
                        <th className="text-left py-2 px-2">Lý do</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 text-xs">{fmtDate(h.created_at)}</td>
                          <td className="text-center px-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${h.kind === 'ban' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {h.kind === 'ban' ? 'Bán' : 'Vốn'}
                            </span>
                          </td>
                          <td className="text-right px-2 text-gray-500">{fmt(h.old_price)}</td>
                          <td className="text-right px-2 font-semibold">{fmt(h.new_price)}</td>
                          <td className="px-2 text-xs">{sourceLabel(h.source)}</td>
                          <td className="px-2 text-xs text-gray-600">{h.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cấu hình ngưỡng cảnh báo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Ngưỡng tăng giá nhập (%)</Label>
              <Input
                type="number" min="0" max="1000" step="0.1"
                value={config.threshold_cost_increase_pct}
                onChange={e => setConfig({ ...config, threshold_cost_increase_pct: Number(e.target.value) })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Khi giá nhập mới cao hơn giá vốn hiện tại từ <b>{config.threshold_cost_increase_pct}%</b> trở lên, hệ thống sẽ tạo đề xuất tăng giá bán.
              </p>
            </div>
            <div>
              <Label>Cách giữ biên lãi khi đề xuất</Label>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="mode" checked={config.margin_keep_mode === 'percent'}
                    onChange={() => setConfig({ ...config, margin_keep_mode: 'percent' })}
                  />
                  Giữ % lãi
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="mode" checked={config.margin_keep_mode === 'absolute'}
                    onChange={() => setConfig({ ...config, margin_keep_mode: 'absolute' })}
                  />
                  Giữ lãi tuyệt đối
                </label>
              </div>
            </div>
            <div>
              <Label>Làm tròn giá đề xuất tới (đ)</Label>
              <Input
                type="number" min="1"
                value={config.round_to}
                onChange={e => setConfig({ ...config, round_to: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={config.enabled_for_thuoc}
                  onChange={e => setConfig({ ...config, enabled_for_thuoc: e.target.checked })}
                />
                Áp dụng cho <b>Thuốc</b>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={config.enabled_for_hang_trong}
                  onChange={e => setConfig({ ...config, enabled_for_hang_trong: e.target.checked })}
                />
                Áp dụng cho <b>Tròng kính</b> <span className="text-xs text-gray-400">(tùy chọn)</span>
              </label>
              <p className="text-xs text-gray-400 italic">Gọng kính không hỗ trợ — quản lý theo nhóm giá riêng.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>Hủy</Button>
            <Button onClick={saveConfig} disabled={savingCfg}>
              {savingCfg ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
