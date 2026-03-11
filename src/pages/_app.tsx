import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthProvider } from '../contexts/AuthContext';
import Header from '../components/Header';
import { initializeApiAuthHeaders } from '../lib/apiAuthHeaders';

const noHeaderPages = ['/login', '/register'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showHeader = !noHeaderPages.includes(router.pathname);

  useEffect(() => {
    initializeApiAuthHeaders();
  }, []);
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <Head>
          {/* Favicon mặc định: con mắt màu xanh */}
          <link rel="icon" href="/eye-blue.svg?v=2" type="image/svg+xml" />
          {/* Tuỳ chọn: nếu bạn có favicon.ico hoặc PNG, thêm các dòng dưới và cập nhật đường dẫn */}
          {/* <link rel="icon" href="/favicon.ico" sizes="any" /> */}
          {/* <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32" /> */}
          {/* <link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16" /> */}
          <meta name="theme-color" content="#0ea5e9" />
        </Head>
        {showHeader && <Header />}
        <main>
          <Component {...pageProps} />
        </main>
      </div>
    </AuthProvider>
  );
}