'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { Headset, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

interface PlatformMessage {
  id: number;
  tenant_id: string;
  sender_id: string;
  noi_dung: string;
  sender_role?: string;
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

export default function PlatformSupportChat({ userId }: { userId?: string }) {
  const [messages, setMessages] = useState<PlatformMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const newMessages: PlatformMessage[] = json.data || [];

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

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetchWithAuth('/api/tin-nhan-platform?limit=30');
        if (!res.ok) return;
        const json = await res.json();
        const newMessages: PlatformMessage[] = json.data || [];
        setMessages(prev => {
          if (
            newMessages.length !== prev.length
            || (newMessages[newMessages.length - 1]?.id !== prev[prev.length - 1]?.id)
          ) {
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 360 }}>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-3 flex-shrink-0">
        <Headset className="w-4 h-4 inline mr-1.5" />
        Nhắn tin trực tiếp với đội ngũ hỗ trợ nền tảng OptiGo
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
        {hasMore && (
          <div className="text-center">
            <button
              type="button"
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
    </div>
  );
}
