/**
 * Giới hạn body, query và pagination dùng chung cho API routes.
 * Import từ đây thay vì hardcode magic numbers trong từng handler.
 */

/** Giới hạn mặc định body parser Next.js API (JSON). */
export const DEFAULT_JSON_BODY_LIMIT = '1mb';

/** Body lớn hơn cho avatar base64, import Excel (`'2mb'`). */
export const LARGE_JSON_BODY_LIMIT = '2mb';

/** Import kho — tối đa dòng mỗi batch. */
export const IMPORT_MAX_ROWS = 500;

/** Pagination nặng — tránh timeout DB. */
export const QUERY_PAGE_SIZE = 1000;
export const QUERY_MAX_ROWS = 50_000;

/** Recent activity hub — pull/push per request caps. */
export const RECENT_ACTIVITY_DEFAULT_DAYS = 3;
export const RECENT_ACTIVITY_MAX_DAYS = 7;
export const RECENT_ACTIVITY_DEFAULT_LIMIT = 300;
export const RECENT_ACTIVITY_MAX_LIMIT = 400;

/** Rate limits (số lượt / cửa sổ ms). */
export const RATE_LIMITS = {
  register: { limit: 5, windowMs: 15 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 1000 },
  reportSuper: { limit: 10, windowMs: 60 * 1000 },
  importExcel: { limit: 5, windowMs: 10 * 60 * 1000 },
  dashboard: { limit: 30, windowMs: 60 * 1000 },
  mediaUpload: { limit: 60, windowMs: 10 * 60 * 1000 },
  crmCustomers: { limit: 20, windowMs: 60 * 1000 },
  ksctSimulate: { limit: 60, windowMs: 60 * 1000 },
  recentActivity: { limit: 60, windowMs: 60 * 1000 },
} as const;
