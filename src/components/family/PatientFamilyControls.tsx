'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import FamilyCard from '@/components/FamilyCard';
import FamilyBottomSheet from './FamilyBottomSheet';
import FamilyDesktopDialog from './FamilyDesktopDialog';
import FamilySummaryChip from './FamilySummaryChip';
import { usePatientFamily } from './usePatientFamily';

type DialogIntent = 'manage' | 'add' | 'create' | 'link';
type PanelPhase = 'closed' | 'list' | 'dialog';

interface PatientFamilyProviderProps {
  benhnhanId: number | null;
  patientName: string;
  onSelectMember: (memberPatientId: number) => void;
  beforeMemberSwitch?: () => boolean | Promise<boolean>;
  children?: ReactNode;
}

interface PatientFamilyUIContextValue {
  openSheet: () => void;
}

interface PatientFamilyNavContextValue {
  selectMember: (memberPatientId: number) => void;
}

const PatientFamilyUIContext = createContext<PatientFamilyUIContextValue | null>(null);
const PatientFamilyNavContext = createContext<PatientFamilyNavContextValue | null>(null);

function usePatientFamilyUI() {
  const ctx = useContext(PatientFamilyUIContext);
  if (!ctx) throw new Error('PatientFamily components must be inside PatientFamilyProvider');
  return ctx;
}

function usePatientFamilyNav() {
  const ctx = useContext(PatientFamilyNavContext);
  if (!ctx) throw new Error('PatientFamily components must be inside PatientFamilyProvider');
  return ctx;
}

const sharedCardClass = 'border-0 shadow-none';

function useIsLargeScreen() {
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLg(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isLg;
}

export function PatientFamilyProvider({
  benhnhanId,
  patientName,
  onSelectMember,
  beforeMemberSwitch,
  children,
}: PatientFamilyProviderProps) {
  const isLg = useIsLargeScreen();
  const [phase, setPhase] = useState<PanelPhase>('closed');
  const [dialogIntent, setDialogIntent] = useState<DialogIntent | null>(null);

  const closeAll = useCallback(() => {
    setPhase('closed');
    setDialogIntent(null);
  }, []);

  const openSheet = useCallback(() => {
    setDialogIntent(null);
    setPhase('list');
  }, []);

  const enterDialogMode = useCallback((intent: DialogIntent) => {
    setDialogIntent(intent);
    setPhase('dialog');
  }, []);

  const handleSelectMember = useCallback(
    async (memberPatientId: number) => {
      if (!benhnhanId || memberPatientId === benhnhanId) return;
      if (beforeMemberSwitch) {
        const ok = await beforeMemberSwitch();
        if (!ok) return;
      }
      closeAll();
      onSelectMember(memberPatientId);
    },
    [benhnhanId, beforeMemberSwitch, closeAll, onSelectMember],
  );

  const uiValue = useMemo(() => ({ openSheet }), [openSheet]);
  const navValue = useMemo(
    () => ({ selectMember: handleSelectMember }),
    [handleSelectMember],
  );

  const cardBaseProps = benhnhanId
    ? {
        benhnhanId,
        patientName,
        onSelectMember: handleSelectMember,
        className: sharedCardClass,
      }
    : null;

  if (!benhnhanId) {
    return <>{children}</>;
  }

  return (
    <PatientFamilyUIContext.Provider value={uiValue}>
      <PatientFamilyNavContext.Provider value={navValue}>
        {children}

        {/* Mobile: danh sách nhóm trong bottom sheet */}
        {phase === 'list' && !isLg && cardBaseProps && (
          <FamilyBottomSheet open onClose={closeAll} title="Nhóm gia đình">
            <FamilyCard
              {...cardBaseProps}
              embeddedInSheet
              onRequestDialogMode={enterDialogMode}
            />
          </FamilyBottomSheet>
        )}

        {/* Desktop: dialog danh sách nhóm */}
        {phase === 'list' && isLg && cardBaseProps && (
          <FamilyDesktopDialog open onClose={closeAll}>
            <FamilyCard {...cardBaseProps} />
          </FamilyDesktopDialog>
        )}

        {/* Mobile: sub-dialog (quản lý/thêm/...) — đóng sheet trước, tránh bị che z-index */}
        {phase === 'dialog' && dialogIntent && cardBaseProps && (
          <FamilyCard
            {...cardBaseProps}
            dialogOnlyMode
            autoOpenManage={dialogIntent === 'manage'}
            autoOpenAdd={dialogIntent === 'add'}
            autoOpenCreate={dialogIntent === 'create'}
            autoOpenLink={dialogIntent === 'link'}
            onModalSessionEnd={closeAll}
            className="hidden"
          />
        )}
      </PatientFamilyNavContext.Provider>
    </PatientFamilyUIContext.Provider>
  );
}

function PatientFamilyChip({
  benhnhanId,
  variant,
}: {
  benhnhanId: number | null;
  variant: 'header' | 'default';
}) {
  const { openSheet } = usePatientFamilyUI();
  const { family, loading } = usePatientFamily(benhnhanId);
  if (!benhnhanId) return null;

  return (
    <FamilySummaryChip
      family={family}
      loading={loading}
      benhnhanId={benhnhanId}
      onOpen={openSheet}
      variant={variant}
    />
  );
}

export function PatientFamilyMobileChip({ benhnhanId }: { benhnhanId: number | null }) {
  return <PatientFamilyChip benhnhanId={benhnhanId} variant="header" />;
}

export function PatientFamilyDesktopChip({ benhnhanId }: { benhnhanId: number | null }) {
  return <PatientFamilyChip benhnhanId={benhnhanId} variant="default" />;
}
