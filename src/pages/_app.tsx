import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AuthProvider } from '../contexts/AuthContext';
import { BranchProvider } from '../contexts/BranchContext';
import { ConfirmProvider } from '../components/ui/confirm-dialog';
import Header from '../components/Header';
import Footer from '../components/Footer';
import MobileBottomNav from '../components/MobileBottomNav';
import { FooterProvider } from '../contexts/FooterContext';
import { PageTabsProvider } from '../contexts/PageTabsContext';
import { initializeApiAuthHeaders } from '../lib/apiAuthHeaders';
import { Toaster } from 'react-hot-toast';

// Register auth interceptors at module level (before any component effects run)
initializeApiAuthHeaders();

const noHeaderPages = ['/login', '/register'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showHeader = !noHeaderPages.includes(router.pathname);
  const hideGlobalHeaderOnMobile = router.pathname === '/benh-nhan'
    || router.pathname === '/lich-hen'
    || router.pathname === '/don-kinh';
  const mobileThemeColor = router.pathname === '/benh-nhan'
    ? '#3a7efb'
    : router.pathname === '/lich-hen'
      ? '#1976D2'
      : router.pathname === '/don-kinh'
        ? '#1f6cc0'
      : '#065f46';
  const mainClass = showHeader
    ? (hideGlobalHeaderOnMobile ? 'pb-8 md:pt-10' : 'pt-10 pb-8')
    : '';
  return (
    <AuthProvider>
      <BranchProvider>
      <FooterProvider>
      <PageTabsProvider>
      <ConfirmProvider>
      <div className="min-h-screen bg-[#f6faf7]">
        <Head>
          {/* Viewport optimised for mobile / PWA standalone (notch-safe) */}
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5"
          />

          {/* App identity */}
          <meta name="application-name" content="Optigo" />
          <meta name="description" content="Optigo - Phần mềm quản lý phòng khám mắt & cửa hàng kính." />

          {/* Favicon: con mắt màu xanh + PNG fallbacks */}
          <link rel="icon" href="/eye-blue.svg?v=2" type="image/svg+xml" />
          <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />

          {/* Web App Manifest */}
          <link rel="manifest" href="/manifest.webmanifest" />

          {/* Android / Chrome theme */}
          <meta name="theme-color" content={mobileThemeColor} />
          <meta name="mobile-web-app-capable" content="yes" />

          {/* iOS / Safari standalone */}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Optigo" />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

          {/* Windows tiles */}
          <meta name="msapplication-TileColor" content="#0ea5e9" />
          <meta name="msapplication-TileImage" content="/icons/icon-192.png" />

          {/* Format detection (prevent iOS auto-linking phone numbers) */}
          <meta name="format-detection" content="telephone=no" />
        </Head>
        {showHeader && (
          <div className={hideGlobalHeaderOnMobile ? 'hidden md:block' : ''}>
            <Header />
          </div>
        )}
        <main className={mainClass}>
          <Component {...pageProps} />
        </main>
        {showHeader && <Footer />}
        {showHeader && <MobileBottomNav />}
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
      </PageTabsProvider>
      </FooterProvider>
      </BranchProvider>
    </AuthProvider>
  );
}