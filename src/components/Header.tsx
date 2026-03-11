import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X, Home, Users, FileText, Glasses, List, BarChart, LogOut, UserSearch, Building2, Settings } from 'lucide-react';

export default function Header() {
  const { user, signOut, tenants, currentTenant, currentTenantId, switchTenant, currentRole } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { href: '/', label: 'Trang chủ', icon: Home },
    { href: '/benh-nhan', label: 'Bệnh nhân', icon: Users },
    { href: '/don-thuoc', label: 'Đơn thuốc', icon: FileText },
    { href: '/don-kinh', label: 'Đơn kính', icon: Glasses },
    { href: '/danh-muc', label: 'Danh mục', icon: List },
    { href: '/bao-cao', label: 'Báo cáo', icon: BarChart },
    { href: '/pending-faces', label: 'Chờ gán', icon: UserSearch },
  ];

  const isActivePage = (href: string) => router.pathname === href;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="bg-blue-900 text-white shadow-lg relative">
      <div className="container mx-auto px-4">
  {/* Desktop Header (md and up) */}
  <div className="hidden md:flex items-center justify-between py-2">
          <nav className="flex space-x-1">
            {menuItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1 text-sm transition-colors rounded ${
                  isActivePage(href)
                    ? 'bg-white text-black'
                    : 'bg-blue-800 hover:bg-white hover:text-black'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center space-x-4">
            {/* Tenant selector */}
            {tenants.length > 0 && (
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-blue-200" />
                {tenants.length === 1 ? (
                  <span className="text-sm text-blue-100">{currentTenant?.name || 'Phòng khám'}</span>
                ) : (
                  <select
                    className="bg-blue-800 text-white text-sm rounded px-2 py-1 border border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={currentTenantId || ''}
                    onChange={e => switchTenant(e.target.value)}
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                {(currentRole === 'owner' || currentRole === 'admin') && (
                  <Link
                    href="/quan-ly-phong-kham"
                    className="p-1 rounded hover:bg-blue-700 transition-colors"
                    title="Quản lý phòng khám"
                  >
                    <Settings className="w-4 h-4 text-blue-200" />
                  </Link>
                )}
              </div>
            )}
            <span className="text-sm">
              Chào {user?.email || 'Guest'}
            </span>
            <button
              onClick={() => signOut()}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Mobile Header */}
  <div className="md:hidden flex items-center justify-between py-3">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold">Phòng khám</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className="text-sm hidden sm:block">
              {user?.email?.split('@')[0] || 'Guest'}
            </span>
            <button
              onClick={toggleMobileMenu}
              className="p-2 rounded-md hover:bg-blue-800 transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-blue-900 border-t border-blue-700 shadow-lg z-50">
            <nav className="px-4 py-2 space-y-1">
              {menuItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md transition-colors ${
                    isActivePage(href)
                      ? 'bg-white text-blue-900'
                      : 'hover:bg-blue-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{label}</span>
                </Link>
              ))}
              
              <div className="border-t border-blue-700 my-2"></div>
              
              {/* Mobile tenant selector */}
              {tenants.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-xs text-blue-200 mb-1 flex items-center space-x-1">
                    <Building2 className="w-3 h-3" />
                    <span>Phòng khám</span>
                  </p>
                  {tenants.length === 1 ? (
                    <p className="text-sm font-medium">{currentTenant?.name}</p>
                  ) : (
                    <select
                      className="w-full bg-blue-800 text-white text-sm rounded px-2 py-2 border border-blue-600"
                      value={currentTenantId || ''}
                      onChange={e => switchTenant(e.target.value)}
                    >
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                  {(currentRole === 'owner' || currentRole === 'admin') && (
                    <Link
                      href="/quan-ly-phong-kham"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center space-x-2 mt-2 px-3 py-2 rounded-md hover:bg-blue-800 transition-colors text-sm"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Quản lý phòng khám</span>
                    </Link>
                  )}
                </div>
              )}

              <div className="border-t border-blue-700 my-2"></div>
              <div className="px-3 py-2">
                <p className="text-xs text-blue-200 mb-2">
                  Đăng nhập: {user?.email || 'Guest'}
                </p>
                <button
                  onClick={() => {
                    signOut();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Đăng xuất</span>
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}