import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AuthProvider } from '../contexts/AuthContext';
import { BranchProvider } from '../contexts/BranchContext';
import { ConfirmProvider } from '../components/ui/confirm-dialog';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { FooterProvider } from '../contexts/FooterContext';
import { initializeApiAuthHeaders } from '../lib/apiAuthHeaders';
import { Toaster } from 'react-hot-toast';

// Register auth interceptors at module level (before any component effects run)
initializeApiAuthHeaders();

const noHeaderPages = ['/login', '/register'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showHeader = !noHeaderPages.includes(router.pathname);
  return (
    <AuthProvider>
      <BranchProvider>
      <FooterProvider>
      <ConfirmProvider>
      <div className="min-h-screen bg-[#f6faf7]">
        <Head>
          {/* Favicon mặc định: con mắt màu xanh */}
          <link rel="icon" href="/eye-blue.svg?v=2" type="image/svg+xml" />
          {/* Tuỳ chọn: nếu bạn có favicon.ico hoặc PNG, thêm các dòng dưới và cập nhật đường dẫn */}
          {/* <link rel="icon" href="/favicon.ico" sizes="any" /> */}
          {/* <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32" /> */}
          {/* <link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16" /> */}
          <meta name="theme-color" content="#065f46" />
        </Head>
        {showHeader && <Header />}
        <main className={showHeader ? 'pt-10 pb-8' : ''}>
          <Component {...pageProps} />
        </main>
        {showHeader && <Footer />}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              border: '1px solid rgba(0,0,0,0.05)',
              maxWidth: '420px',
            },
            success: {
              style: {
                background: '#eff6ff',
                color: '#1e3a5f',
                border: '1px solid #bfdbfe',
              },
              iconTheme: {
                primary: '#2563eb',
                secondary: '#eff6ff',
              },
            },
            error: {
              style: {
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
              },
              iconTheme: {
                primary: '#dc2626',
                secondary: '#fef2f2',
              },
            },
          }}
        />
      </div>
      </ConfirmProvider>
      </FooterProvider>
      </BranchProvider>
    </AuthProvider>
  );
}