import React, { useEffect, useRef, useState } from 'react';
import { PatientFormDialog } from '@/components/benh-nhan/PatientFormDialog';
import { usePatientFormSubmit } from '@/hooks/usePatientFormSubmit';
import { parsePatientSeed } from '@/lib/patientSeed';
import type { BenhNhan } from '@/lib/patient/types';

export type QuickPatientCreateDialogProps = {
  open: boolean;
  seedText?: string;
  /** Prefill địa chỉ khi seed không có (vd. địa chỉ chi nhánh). */
  defaultDiachi?: string;
  onClose: () => void;
  onCreated: (patient: BenhNhan) => void;
};

function emptyForm(seedText: string, defaultDiachi: string): BenhNhan {
  const seed = parsePatientSeed(seedText);
  return {
    ten: seed.ten,
    namsinh: seed.namsinh,
    gioitinh: '',
    dienthoai: seed.dienthoai,
    diachi: seed.diachi || defaultDiachi,
  };
}

export function QuickPatientCreateDialog({
  open,
  seedText = '',
  defaultDiachi = '',
  onClose,
  onCreated,
}: QuickPatientCreateDialogProps) {
  const { submit, isSubmitting } = usePatientFormSubmit();
  const [form, setForm] = useState<BenhNhan>(() => emptyForm(seedText, defaultDiachi));
  const tenRef = useRef<HTMLInputElement | null>(null);
  const namsinhRef = useRef<HTMLInputElement | null>(null);
  const dienthoaiRef = useRef<HTMLInputElement | null>(null);
  const diachiRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(seedText, defaultDiachi));
    const t = window.setTimeout(() => {
      const seed = parsePatientSeed(seedText);
      if (!seed.ten) tenRef.current?.focus();
      else if (!seed.namsinh) namsinhRef.current?.focus();
      else if (!seed.dienthoai) dienthoaiRef.current?.focus();
      else diachiRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, seedText, defaultDiachi]);

  const handleSubmit = async () => {
    const result = await submit({ form, isEditing: false });
    if (!result.ok || !result.patient?.id) return;
    onCreated(result.patient);
  };

  return (
    <PatientFormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isEditing={false}
      form={form}
      setForm={setForm}
      isSubmitting={isSubmitting}
      onSubmit={() => {
        void handleSubmit();
      }}
      tenRef={tenRef}
      namsinhRef={namsinhRef}
      dienthoaiRef={dienthoaiRef}
      diachiRef={diachiRef}
      title="Thêm khách nhanh"
    />
  );
}
