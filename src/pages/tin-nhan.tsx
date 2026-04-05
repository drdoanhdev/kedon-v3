'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { MessageCircle, Send, ArrowDown, Headset } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';

interface TinNhan {
  id: number;
  tenant_id: string;
  sender_id: string;
  noi_dung: string;
  is_from_admin?: boolean;
  sender_role?: string;
  da_doc: boolean;
  da_doc_tenant?: boolean;
  created_at: string;
  sender_name?: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hôm qua ${time}`;

  return `${d.toLocaleDateString('vi-VN')} ${time}`;
}

export default function TinNhanPage() {
  const { user, currentRole } = useAuth();
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';
  const isOwner = currentRole === 'owner';
  const userId = user?.id;

  const [activeChannel, setActiveChannel] = useState<'internal' | 'platform'>('internal');

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Tab switcher — chỉ hiện tab hỗ trợ nền tảng cho chủ phòng khám */}
        {isOwner ? (
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 flex-shrink-0">
            <button
              onClick={() => setActiveChannel('internal')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeChannel === 'internal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              Nội bộ phòng khám
            </button>
            <button
              onClick={() => setActiveChannel('platform')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeChannel === 'platform' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Headset className="w-4 h-4" />
              Hỗ trợ nền tảng
            </button>
          </div>
        ) : null}

        {activeChannel === 'internal' || !isOwner ? (
          <InternalChat userId={userId} isAdmin={isAdmin} />
        ) : (
          <PlatformChat userId={userId} />
        )}
      </div>
    </ProtectedRoute>
  );
}

// ==================== CHAT NỘI BỘ PHÒNG KHÁM (giữ nguyên logic cũ) ====================
function InternalChat({ userId, isAdmin }: { userId?: string; isAdmin: boolean }) {
  const [messages, setMessages] = useState<TinNhan[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const fetchMessages = useCallback(async (beforeId?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (beforeId) params.set('before_id', String(beforeId));

      const res = await fetchWithAuth(`/api/tin-nhan?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const newMessages: TinNhan[] = json.data || [];

      if (beforeId) {
        // Load more (prepend)
        setMessages(prev => [...newMessages, ...prev]);
        setHasMore(newMessages.length >= 30);
      } else {
        setMessages(newMessages);
        setHasMore(newMessages.length >= 30);
        // Scroll to bottom on first load
        setTimeout(() => scrollToBottom(false), 100);
      }
    } catch {
      toast.error('Không thể tải tin nhắn');
    } finally {
      setLoading(false);
    }
  }, [scrollToBottom]);

  // Mark as read on page load
  const markRead = useCallback(async () => {
    try {
      await fetchWithAuth('/api/tin-nhan', {
        method: 'PATCH',
        body: JSON.stringify({ mark_all_read: true }),
      });
    } catch { /* silent */ }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMessages();
    markRead();
  }, [fetchMessages, markRead]);

  // Polling: check new messages every 10s (trang tin nhắn cần nhanh hơn)
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetchWithAuth('/api/tin-nhan?limit=30');
        if (!res.ok) return;
        const json = await res.json();
        const newMessages: TinNhan[] = json.data || [];
        setMessages(prev => {
          if (newMessages.length !== prev.length || (newMessages[newMessages.length - 1]?.id !== prev[prev.length - 1]?.id)) {
            // Có tin mới → update + scroll
            setTimeout(() => scrollToBottom(), 100);
            return newMessages;
          }
          return prev;
        });
      } catch { /* silent */ }
    };

    const startPoll = () => {
      pollTimerRef.current = setInterval(poll, 10_000);
    };

    startPoll();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [scrollToBottom]);

  const sendMessage = async () => {
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetchWithAuth('/api/tin-nhan', {
        method: 'POST',
        body: JSON.stringify({ noi_dung: newMsg }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setMessages(prev => [...prev, { ...json.data, sender_name: 'Bạn' }]);
      setNewMsg('');
      setTimeout(() => scrollToBottom(), 50);
    } catch {
      toast.error('Lỗi gửi tin nhắn');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const loadMore = () => {
    if (messages.length > 0 && !loading) {
      fetchMessages(messages[0].id);
    }
  };

  return (
    <>
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3"
      >
        {/* Load more */}
        {hasMore && (
          <div className="text-center">
            <button
              className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? 'Đang tải...' : '↑ Xem tin cũ hơn'}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Chưa có tin nhắn nào</p>
            <p className="text-gray-300 text-xs mt-1">
              {isAdmin ? 'Nhân viên sẽ gửi tin nhắn cho bạn tại đây' : 'Gửi tin nhắn cho quản trị viên'}
            </p>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => {
          const isMine = msg.sender_id === userId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[80%]">
                {!isMine && (
                  <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                    {msg.sender_name || 'Unknown'}
                    {msg.is_from_admin && (
                      <span className="ml-1 text-emerald-500 font-medium">★</span>
                    )}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? 'bg-emerald-600 text-white rounded-br-md'
                      : msg.is_from_admin
                        ? 'bg-blue-100 text-blue-900 rounded-bl-md border border-blue-200'
                        : 'bg-white text-gray-800 rounded-bl-md border border-gray-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.noi_dung}</p>
                </div>
                <p className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isMine ? 'text-right' : ''}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 mt-3">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder={isAdmin ? 'Nhắn tin cho nhân viên...' : 'Nhắn tin cho quản trị viên...'}
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 resize-none max-h-32 min-h-[44px]"
            maxLength={2000}
            style={{ height: 'auto', minHeight: '44px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          <Button
            onClick={sendMessage}
            disabled={!newMsg.trim() || sending}
            className="bg-emerald-600 hover:bg-emerald-700 h-11 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-gray-300 mt-1 text-right">
          Enter gửi • Shift+Enter xuống dòng
        </p>
      </div>
    </>
  );
}

// ==================== CHAT VỚI SUPERADMIN (Hỗ trợ nền tảng) ====================
function PlatformChat({ userId }: { userId?: string }) {
  const [messages, setMessages] = useState<TinNhan[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const fetchMessages = useCallback(async (beforeId?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (beforeId) params.set('before_id', String(beforeId));

      const res = await fetchWithAuth(`/api/tin-nhan-platform?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const newMessages: TinNhan[] = json.data || [];

      if (beforeId) {
        setMessages(prev => [...newMessages, ...prev]);
        setHasMore(newMessages.length >= 30);
      } else {
        setMessages(newMessages);
        setHasMore(newMessages.length >= 30);
        setTimeout(() => scrollToBottom(false), 100);
      }
    } catch {
      toast.error('Không thể tải tin nhắn');
    } finally {
      setLoading(false);
    }
  }, [scrollToBottom]);

  const markRead = useCallback(async () => {
    try {
      await fetchWithAuth('/api/tin-nhan-platform', {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchMessages();
    markRead();
  }, [fetchMessages, markRead]);

  // Polling every 15s
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetchWithAuth('/api/tin-nhan-platform?limit=30');
        if (!res.ok) return;
        const json = await res.json();
        const newMessages: TinNhan[] = json.data || [];
        setMessages(prev => {
          if (newMessages.length !== prev.length || (newMessages[newMessages.length - 1]?.id !== prev[prev.length - 1]?.id)) {
            setTimeout(() => scrollToBottom(), 100);
            return newMessages;
          }
          return prev;
        });
      } catch { /* silent */ }
    };

    const timer = setInterval(poll, 15_000);
    return () => clearInterval(timer);
  }, [scrollToBottom]);

  const sendMessage = async () => {
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetchWithAuth('/api/tin-nhan-platform', {
        method: 'POST',
        body: JSON.stringify({ noi_dung: newMsg }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setMessages(prev => [...prev, { ...json.data, sender_name: 'Bạn' }]);
      setNewMsg('');
      setTimeout(() => scrollToBottom(), 50);
    } catch {
      toast.error('Lỗi gửi tin nhắn');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-3 flex-shrink-0">
        <Headset className="w-4 h-4 inline mr-1.5" />
        Nhắn tin trực tiếp với đội ngũ hỗ trợ nền tảng OcularCare
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
        {hasMore && (
          <div className="text-center">
            <button
              className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
              onClick={() => messages.length > 0 && fetchMessages(messages[0].id)}
              disabled={loading}
            >
              {loading ? 'Đang tải...' : '↑ Xem tin cũ hơn'}
            </button>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="text-center py-12">
            <Headset className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Chưa có tin nhắn nào</p>
            <p className="text-gray-300 text-xs mt-1">Gửi tin nhắn nếu bạn cần hỗ trợ từ quản trị viên nền tảng</p>
          </div>
        )}

        {messages.map(msg => {
          const isMine = msg.sender_id === userId;
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                {!isMine && (
                  <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                    {msg.sender_name || 'Hỗ trợ'}
                    {msg.sender_role === 'superadmin' && (
                      <span className="ml-1 text-purple-500 font-medium">⚡</span>
                    )}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? 'bg-emerald-600 text-white rounded-br-md'
                      : 'bg-purple-100 text-purple-900 rounded-bl-md border border-purple-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.noi_dung}</p>
                </div>
                <p className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isMine ? 'text-right' : ''}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 mt-3">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Nhắn tin cho đội ngũ hỗ trợ..."
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 resize-none max-h-32 min-h-[44px]"
            maxLength={2000}
            style={{ height: 'auto', minHeight: '44px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          <Button
            onClick={sendMessage}
            disabled={!newMsg.trim() || sending}
            className="bg-purple-600 hover:bg-purple-700 h-11 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-gray-300 mt-1 text-right">
          Enter gửi • Shift+Enter xuống dòng
        </p>
      </div>
    </>
  );
}
