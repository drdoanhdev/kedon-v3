import Head from 'next/head';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <>
      <Head>
        <title>Không có kết nối - Optigo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 text-center">
        <img src="/icons/icon-192.png" alt="Optigo" width={96} height={96} className="mb-6 rounded-2xl shadow" />
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Bạn đang offline</h1>
        <p className="text-slate-600 max-w-md mb-6">
          Optigo cần kết nối Internet để tải dữ liệu phòng khám. Vui lòng kiểm tra mạng và thử lại.
        </p>
        <button
          type="button"
          onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
          className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-medium shadow"
        >
          Thử lại
        </button>
        <Link href="/" className="mt-3 text-sm text-sky-600 hover:underline">Về trang chủ</Link>
      </div>
    </>
  );
}
