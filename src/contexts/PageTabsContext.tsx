import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface PageTabItem {
  key: string;
  label: string;
  count?: number;
  /** Icon component (lucide-react hoặc tương tự). Optional. */
  icon?: React.ComponentType<{ className?: string }>;
}

export interface PageTabsConfig {
  items: PageTabItem[];
  activeIdx: number;
  onChange: (idx: number) => void;
}

interface PageTabsContextType {
  pageTabs: PageTabsConfig | null;
  setPageTabs: (cfg: PageTabsConfig | null) => void;
}

const PageTabsContext = createContext<PageTabsContextType>({ pageTabs: null, setPageTabs: () => {} });

export function PageTabsProvider({ children }: { children: ReactNode }) {
  const [pageTabs, setPageTabs] = useState<PageTabsConfig | null>(null);
  return (
    <PageTabsContext.Provider value={{ pageTabs, setPageTabs }}>
      {children}
    </PageTabsContext.Provider>
  );
}

export function usePageTabsContext() {
  return useContext(PageTabsContext);
}

/**
 * Hook để 1 page đăng ký tabs cho bottom nav.
 * Truyền items + activeIdx + onChange. Tabs sẽ hiển thị trong MobileBottomNav.
 * Tự động clear khi unmount.
 */
export function usePageTabs(
  items: PageTabItem[],
  activeIdx: number,
  onChange: (idx: number) => void,
) {
  const { setPageTabs } = useContext(PageTabsContext);
  // Stable JSON key to avoid re-setting when items shape unchanged
  const key = JSON.stringify(items.map(i => ({ k: i.key, l: i.label, c: i.count ?? 0 })));
  useEffect(() => {
    setPageTabs({ items, activeIdx, onChange });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activeIdx]);
  useEffect(() => {
    return () => setPageTabs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
