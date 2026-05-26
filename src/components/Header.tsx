import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X, Home, Users, FileText, Glasses, Frame, List, BarChart, LogOut, UserSearch, Building2, Settings, Warehouse, Pill, ChevronDown, Shield, CalendarDays, Bell, MessageCircle, CreditCard, Printer, Lock, ArrowRightLeft, Search, BarChart3, GitBranch, Send, CheckSquare, Loader2, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { useFeatureGate } from '../hooks/useFeatureGate';
import type { FeatureKey } from '../lib/featureConfig';
import { fetchWithAuth } from '../lib/fetchWithAuth';

type QuickThongBao = {
  id: number;
  tieu_de: string;
  noi_dung: string;
  da_doc: boolean;
  created_at: string;
};

type QuickTinNhan = {
  id: number;
  noi_dung: string;
  da_doc: boolean;
  created_at: string;
  sender_name?: string;
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  if (diffHour < 24) return `${diffHour} giờ`;
  if (diffDay < 7) return `${diffDay} ngày`;
  return d.toLocaleDateString('vi-VN');
}

export default function Header() {
  const { user, signOut, tenants, currentTenant, currentTenantId, switchTenant, currentRole, userRole } = useAuth();
  const { branches, currentBranchId, currentBranch, switchBranch, isMultiBranch } = useBranch();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMsgOpen, setIsMsgOpen] = useState(false);
  const [quickNotifs, setQuickNotifs] = useState<QuickThongBao[]>([]);
  const [quickMsgs, setQuickMsgs] = useState<QuickTinNhan[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [quickReplyMsg, setQuickReplyMsg] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const { counts } = useNotificationPolling();
  const { canAccessFeature } = useFeatureGate();

  // Main navigation items (always visible in nav bar)
  const mainMenuItems: { href: string; label: string; icon: any; feature?: FeatureKey }[] = [
    { href: '/', label: 'Trang chủ', icon: Home },
    { href: '/benh-nhan', label: 'Bệnh nhân', icon: Users, feature: 'patient_management' },
    { href: '/don-thuoc', label: 'Đơn thuốc', icon: FileText, feature: 'prescription_medicine' },
    { href: '/don-kinh', label: 'Đơn kính', icon: Glasses, feature: 'prescription_glasses' },
    { href: '/quan-ly-kho', label: 'Kho tròng', icon: Warehouse, feature: 'inventory_lens' },
    { href: '/quan-ly-kho-gong', label: 'Kho gọng', icon: Frame, feature: 'inventory_lens' },
    { href: '/quan-ly-kho-thuoc', label: 'Kho thuốc', icon: Pill, feature: 'inventory_drug' },
    { href: '/lich-hen', label: 'Lịch hẹn', icon: CalendarDays, feature: 'appointments' },
  ];

  // Items inside avatar dropdown
  const avatarMenuItems: { href: string; label: string; icon: any; feature?: FeatureKey }[] = [
    { href: '/danh-muc', label: 'Danh mục', icon: List, feature: 'categories' },
    { href: '/bao-cao', label: 'Báo cáo', icon: BarChart, feature: 'basic_reports' },
    { href: '/bao-cao-super', label: 'Báo cáo Pro', icon: BarChart, feature: 'advanced_reports' },
    { href: '/cham-soc-khach-hang', label: 'Chăm sóc KH', icon: Users, feature: 'crm' },
    { href: '/quan-ly-ghi-chu-khach-hang', label: 'Việc cần làm KH', icon: CalendarDays, feature: 'crm' },
    { href: '/nhac-viec', label: 'Nhac viec noi bo', icon: CheckSquare },
    { href: '/dieu-chuyen-kho', label: 'Điều chuyển kho', icon: ArrowRightLeft, feature: 'branch_transfer' },
    { href: '/tra-cuu-khach-hang', label: 'Tra cứu KH', icon: Search, feature: 'multi_branch' },
    { href: '/bao-cao-chuoi', label: 'Báo cáo chuỗi', icon: BarChart3, feature: 'chain_reports' },
  ];

  const isActivePage = (href: string) => router.pathname === href;

  const openGlobalPatientSearch = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('open-global-patient-search'));
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const fetchQuickNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await fetchWithAuth('/api/thong-bao?limit=8');
      if (!res.ok) throw new Error('Không tải được thông báo');
      const json = await res.json();
      setQuickNotifs(json.data || []);
    } catch {
      setQuickNotifs([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const fetchQuickMessages = async () => {
    setMsgLoading(true);
    try {
      const res = await fetchWithAuth('/api/tin-nhan?limit=8');
      if (!res.ok) throw new Error('Không tải được tin nhắn');
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      setQuickMsgs(data.slice(-8).reverse());
    } catch {
      setQuickMsgs([]);
    } finally {
      setMsgLoading(false);
    }
  };

  const markAllNotificationsRead = async () => {
    await fetchWithAuth('/api/thong-bao', {
      method: 'PATCH',
      body: JSON.stringify({ mark_all_read: true }),
    });
    setQuickNotifs(prev => prev.map(n => ({ ...n, da_doc: true })));
  };

  const markAllMessagesRead = async () => {
    await fetchWithAuth('/api/tin-nhan', {
      method: 'PATCH',
      body: JSON.stringify({ mark_all_read: true }),
    });
    setQuickMsgs(prev => prev.map(m => ({ ...m, da_doc: true })));
  };

  const sendQuickMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyMsg.trim()) return;
    setMsgSending(true);
    try {
      const res = await fetchWithAuth('/api/tin-nhan', {
        method: 'POST',
        body: JSON.stringify({ noi_dung: quickReplyMsg.trim() }),
      });
      if (!res.ok) throw new Error();
      setQuickReplyMsg('');
      toast.success('Đã gửi');
      await fetchQuickMessages();
    } catch {
      toast.error('Lỗi gửi tin nhắn');
    } finally {
      setMsgSending(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setIsAvatarOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (msgRef.current && !msgRef.current.contains(e.target as Node)) {
        setIsMsgOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsAvatarOpen(false);
    setIsNotifOpen(false);
    setIsMsgOpen(false);
  }, [router.pathname]);

  const userInitial = (user?.email?.[0] || 'U').toUpperCase();

  return (
    <header className="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-md border-b border-blue-50/10 shadow-sm">
      <div className="px-6 lg:px-8">
        {/* Desktop Header (md and up) */}
        <div className="hidden md:flex items-center h-10 gap-3">
          <div className="flex items-center gap-8 flex-1 min-w-0">
            <nav className="flex gap-1 items-end h-full">
              {mainMenuItems.map(({ href, label, feature }) => {
                const locked = feature ? !canAccessFeature(feature) : false;
                return (
                  <Link
                    key={href}
                    href={locked ? '/billing' : href}
                    className={`text-[13px] font-medium px-3 pb-1.5 pt-1 transition-all flex items-center gap-1 ${
                      locked
                        ? 'text-gray-300 cursor-default'
                        : isActivePage(href)
                          ? 'text-blue-700 border-b-2 border-blue-700'
                          : 'text-gray-500 hover:text-blue-600 hover:border-b-2 hover:border-blue-300'
                    }`}
                    title={locked ? `Nâng cấp gói để sử dụng ${label}` : label}
                  >
                    {label}
                    {locked && <Lock className="w-3 h-3 text-gray-300" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={openGlobalPatientSearch}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              title="Tìm khách nhanh (Ctrl+K)"
              aria-label="Tìm khách nhanh"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Tìm</span>
              <span className="rounded bg-white/90 px-1 py-0.5 text-[10px] leading-none text-blue-600">K</span>
            </button>
          </div>

          {/* Notification & Message icons */}
          <div className="flex items-center gap-1">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                className={`relative p-2 rounded-lg transition-colors ${isNotifOpen || isActivePage('/thong-bao') ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'}`}
                title="Thông báo"
                onClick={async () => {
                  const next = !isNotifOpen;
                  setIsNotifOpen(next);
                  setIsMsgOpen(false);
                  if (next) await fetchQuickNotifications();
                }}
              >
                <Bell className="w-4.5 h-4.5" />
                {counts.thongBao > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {counts.thongBao > 9 ? '9+' : counts.thongBao}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="font-semibold text-sm text-gray-800">Thông báo mới</p>
                    <button onClick={markAllNotificationsRead} className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" />
                      Đọc tất cả
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifLoading && (
                      <div className="py-8 flex justify-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /></div>
                    )}
                    {!notifLoading && quickNotifs.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">Chưa có thông báo</div>
                    )}
                    {!notifLoading && quickNotifs.map(item => (
                      <Link key={item.id} href="/thong-bao" onClick={() => setIsNotifOpen(false)} className={`block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${item.da_doc ? '' : 'bg-blue-50/40'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${item.da_doc ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{item.tieu_de}</p>
                          {!item.da_doc && <span className="mt-1 w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.noi_dung}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(item.created_at)} trước</p>
                      </Link>
                    ))}
                  </div>
                  <Link href="/thong-bao" onClick={() => setIsNotifOpen(false)} className="block text-center text-sm font-medium text-blue-700 hover:bg-blue-50 py-2.5">Xem tất cả</Link>
                </div>
              )}
            </div>

            <div className="relative" ref={msgRef}>
              <button
                type="button"
                className={`relative p-2 rounded-lg transition-colors ${isMsgOpen || isActivePage('/tin-nhan') ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'}`}
                title="Tin nhắn"
                onClick={async () => {
                  const next = !isMsgOpen;
                  setIsMsgOpen(next);
                  setIsNotifOpen(false);
                  if (next) await fetchQuickMessages();
                }}
              >
                <MessageCircle className="w-4.5 h-4.5" />
                {(counts.tinNhan + counts.tinNhanPlatform) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 bg-blue-500 text-white text-[10px] font-bold rounded-full">
                    {(counts.tinNhan + counts.tinNhanPlatform) > 9 ? '9+' : (counts.tinNhan + counts.tinNhanPlatform)}
                  </span>
                )}
              </button>

              {isMsgOpen && (
                <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="font-semibold text-sm text-gray-800">Tin nhắn gần đây</p>
                    <button onClick={markAllMessagesRead} className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" />
                      Đọc tất cả
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {msgLoading && (
                      <div className="py-8 flex justify-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /></div>
                    )}
                    {!msgLoading && quickMsgs.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">Chưa có tin nhắn</div>
                    )}
                    {!msgLoading && quickMsgs.map(item => (
                      <Link key={item.id} href="/tin-nhan" onClick={() => setIsMsgOpen(false)} className={`block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${item.da_doc ? '' : 'bg-blue-50/40'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${item.da_doc ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{item.sender_name || 'Nội bộ phòng khám'}</p>
                          {!item.da_doc && <span className="mt-1 w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.noi_dung}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(item.created_at)} trước</p>
                      </Link>
                    ))}
                  </div>
                  <form onSubmit={sendQuickMessage} className="px-4 py-3 border-t border-gray-100 flex gap-2">
                    <input
                      type="text"
                      placeholder="Trả lời..."
                      value={quickReplyMsg}
                      onChange={e => setQuickReplyMsg(e.target.value)}
                      maxLength={500}
                      className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      disabled={msgSending}
                    />
                    <button
                      type="submit"
                      disabled={msgSending || !quickReplyMsg.trim()}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center gap-1"
                    >
                      {msgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </form>
                  <Link href="/tin-nhan" onClick={() => setIsMsgOpen(false)} className="block text-center text-sm text-gray-500 hover:text-blue-700 hover:bg-blue-50 py-2 text-[13px]">Mở màn hình đầy đủ</Link>
                </div>
              )}
            </div>
          </div>

          {/* Avatar dropdown */}
          <div className="relative" ref={avatarRef}>
            <button
              onClick={() => setIsAvatarOpen(!isAvatarOpen)}
              className="flex items-center space-x-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 border border-blue-200">
                {userInitial}
              </div>
              <span className="text-sm text-gray-600 max-w-[120px] truncate">{user?.email?.split('@')[0] || 'Guest'}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isAvatarOpen ? 'rotate-180' : ''}`} />
            </button>

            {isAvatarOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white text-gray-800 rounded-xl shadow-lg border border-gray-100 z-50 py-1 overflow-hidden">
                {/* Tenant selector (multi-tenant only) */}
                {tenants.length > 1 && (
                  <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40">
                    <div className="flex items-center space-x-2 mb-1">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Chuyển phòng khám</span>
                    </div>
                    <select
                      className="w-full text-sm rounded-lg px-2 py-1 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                      value={currentTenantId || ''}
                      onChange={e => switchTenant(e.target.value)}
                    >
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Branch selector (enterprise multi-branch) */}
                {isMultiBranch && branches.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/40">
                    <div className="flex items-center space-x-2 mb-1">
                      <GitBranch className="w-4 h-4 text-amber-600" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Chi nhánh</span>
                    </div>
                    <select
                      className="w-full text-sm rounded-lg px-2 py-1 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                      value={currentBranchId || ''}
                      onChange={e => switchBranch(e.target.value || null)}
                    >
                      {(currentRole === 'owner' || currentRole === 'admin') && (
                        <option value="">Tất cả chi nhánh</option>
                      )}
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.ten_chi_nhanh}{b.is_main ? ' (Chính)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* User email */}
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Đăng nhập</p>
                  <p className="text-sm font-medium text-gray-700 truncate">{user?.email || 'Guest'}</p>
                </div>

                {/* Menu items in dropdown */}
                {avatarMenuItems.map(({ href, label, icon: Icon, feature }) => {
                  const locked = feature ? !canAccessFeature(feature) : false;
                  return (
                    <Link
                      key={href}
                      href={locked ? '/billing' : href}
                      onClick={() => setIsAvatarOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                        locked
                          ? 'text-gray-300 cursor-default'
                          : isActivePage(href) ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                      }`}
                      title={locked ? `Nâng cấp gói để sử dụng ${label}` : undefined}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1">{label}</span>
                      {locked && <Lock className="w-3 h-3 text-gray-300" />}
                    </Link>
                  );
                })}

                {/* Gói dịch vụ */}
                <Link
                  href="/billing"
                  onClick={() => setIsAvatarOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                    isActivePage('/billing') ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Gói dịch vụ</span>
                </Link>

                {/* Cấu hình in */}
                <Link
                  href="/cau-hinh-in"
                  onClick={() => setIsAvatarOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                    isActivePage('/cau-hinh-in') ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>Cấu hình in</span>
                </Link>

                <Link
                  href="/tem-kinh"
                  onClick={() => setIsAvatarOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                    isActivePage('/tem-kinh') ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>In tem kính</span>
                </Link>

                {/* Nhắn tin tự động (Zalo OA) */}
                {(currentRole === 'owner' || currentRole === 'admin') && (
                  <Link
                    href="/cai-dat-nhan-tin"
                    onClick={() => setIsAvatarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                      isActivePage('/cai-dat-nhan-tin') ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>Nhắn tin tự động</span>
                  </Link>
                )}

                {/* Settings - only for owner/admin */}
                {(currentRole === 'owner' || currentRole === 'admin') && (
                  <Link
                    href="/quan-ly-phong-kham"
                    onClick={() => setIsAvatarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                      isActivePage('/quan-ly-phong-kham') ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Cài đặt phòng khám</span>
                  </Link>
                )}

                {/* Platform Admin - only for superadmin */}
                {userRole === 'superadmin' && (
                  <Link
                    href="/admin"
                    onClick={() => setIsAvatarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                      isActivePage('/admin') ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-red-50 text-red-600'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Quản trị nền tảng</span>
                  </Link>
                )}

                {/* Logout */}
                <div className="border-t border-gray-100 mt-1">
                  <button
                    onClick={async () => {
                      setIsAvatarOpen(false);
                      await signOut();
                    }}
                    className="flex items-center space-x-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 w-full transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Header — chỉ thương hiệu + tên phòng khám. Ẩn trên các trang nội dung dùng header tuỳ biến (vd. /ke-don). */}
        {!router.pathname.startsWith('/ke-don') && (
          <div className="md:hidden flex items-center justify-between h-10 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-extrabold text-blue-900 tracking-tight flex-shrink-0">OptiGo</span>
              {currentTenant?.name && (
                <span className="text-xs text-gray-400 truncate">• {currentTenant.name}</span>
              )}
            </div>
          </div>
        )}

        {/* Mobile Menu Dropdown (đã ngừng dùng — thay bằng MobileBottomNav) */}
        {false && isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-lg z-50">
            <nav className="px-4 py-2 space-y-1">
              {[...mainMenuItems, ...avatarMenuItems].map(({ href, label, icon: Icon, feature }) => {
                const locked = feature ? !canAccessFeature(feature) : false;
                return (
                  <Link
                    key={href}
                    href={locked ? '/billing' : href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-xl transition-colors ${
                      locked
                        ? 'text-gray-300'
                        : isActivePage(href)
                          ? 'bg-blue-50 text-blue-800'
                          : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    title={locked ? `Nâng cấp gói để sử dụng ${label}` : undefined}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium flex-1">{label}</span>
                    {locked && <Lock className="w-3.5 h-3.5 text-gray-300" />}
                  </Link>
                );
              })}
              
              <div className="border-t border-gray-100 my-2"></div>
              
              {/* Mobile tenant selector */}
              {tenants.length > 1 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 flex items-center space-x-1">
                    <Building2 className="w-3 h-3" />
                    <span>Chuyển phòng khám</span>
                  </p>
                  <select
                    className="w-full bg-gray-50 text-gray-800 text-sm rounded-lg px-2 py-2 border border-gray-200"
                    value={currentTenantId || ''}
                    onChange={e => switchTenant(e.target.value)}
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="px-3 py-1">
                <Link
                  href="/billing"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm text-gray-600"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Gói dịch vụ</span>
                </Link>
              </div>

              <div className="px-3 py-1">
                <Link
                  href="/cau-hinh-in"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm text-gray-600"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cấu hình in</span>
                </Link>
              </div>

              <div className="px-3 py-1">
                <Link
                  href="/tem-kinh"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm text-gray-600"
                >
                  <Printer className="w-4 h-4" />
                  <span>In tem kính</span>
                </Link>
              </div>

              {(currentRole === 'owner' || currentRole === 'admin') && (
                <div className="px-3 py-1">
                  <Link
                    href="/quan-ly-phong-kham"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm text-gray-600"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Cài đặt phòng khám</span>
                  </Link>
                </div>
              )}

              <div className="border-t border-gray-100 my-2"></div>
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">
                  Đăng nhập: {user?.email || 'Guest'}
                </p>
                <button
                  onClick={async () => {
                    setIsMobileMenuOpen(false);
                    await signOut();
                  }}
                  className="flex items-center space-x-3 w-full px-3 py-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Đăng xuất</span>
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
