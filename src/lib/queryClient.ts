// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Thời gian cache dữ liệu (mặc định 5 phút)
      staleTime: 1000 * 60 * 5, // 5 phút
      // Thời gian giữ cache khi không sử dụng (mặc định 5 phút)
      cacheTime: 1000 * 60 * 5, // 5 phút
      // Tự động refetch khi window focus (mặc định true)
      refetchOnWindowFocus: false, // Tắt để tiết kiệm tài nguyên
      // Số lần thử lại khi truy vấn thất bại
      retry: 2,
      // Thời gian chờ trước khi thử lại (ms)
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      // Số lần thử lại khi mutation thất bại
      retry: 1,
    },
  },
});