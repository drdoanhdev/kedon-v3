import { useCallback, useState } from 'react';
import { submitPatientForm, type SubmitPatientFormResult } from '@/lib/patient/submitPatientForm';
import type { BenhNhan } from '@/lib/patient/types';

export function usePatientFormSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (options: {
      form: BenhNhan;
      isEditing: boolean;
      successToast?: boolean;
    }): Promise<SubmitPatientFormResult> => {
      if (isSubmitting) return { ok: false };
      setIsSubmitting(true);
      try {
        return await submitPatientForm(options);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting]
  );

  return { submit, isSubmitting };
}
