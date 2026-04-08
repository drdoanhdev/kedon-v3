import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface FooterContextType {
  lai: string | null;
  setLai: (v: string | null) => void;
}

const FooterContext = createContext<FooterContextType>({ lai: null, setLai: () => {} });

export function FooterProvider({ children }: { children: ReactNode }) {
  const [lai, setLai] = useState<string | null>(null);
  return <FooterContext.Provider value={{ lai, setLai }}>{children}</FooterContext.Provider>;
}

export function useFooter() {
  return useContext(FooterContext);
}
