import axios from 'axios';
import toast from 'react-hot-toast';
import { createBenhNhan, updateBenhNhan } from './api';
import type { BenhNhan } from './types';

export type SubmitPatientFormResult =
  | { ok: false }
  | { ok: true; mode: 'create' | 'update'; patient: BenhNhan };

function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.data) {
    return [error.response.data.message, error.response.data.error].filter(Boolean).join(': ');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Validate + create/update BN. Toast lỗi/validation tại chỗ; caller toast success nếu muốn tùy biến. */
export async function submitPatientForm(options: {
  form: BenhNhan;
  isEditing: boolean;
  successToast?: boolean;
}): Promise<SubmitPatientFormResult> {
  const { form, isEditing, successToast = true } = options;

  if (!form.ten || !form.namsinh || !form.diachi) {
    toast.error('Họ tên, năm sinh/ngày sinh và địa chỉ là bắt buộc!');
    return { ok: false };
  }

  const namsinhStr = form.namsinh.trim();
  if (!/^\d{4}$/.test(namsinhStr) && !/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
    toast.error('Năm sinh phải là yyyy hoặc dd/mm/yyyy');
    return { ok: false };
  }

  const finalForm: BenhNhan = {
    ...form,
    namsinh: namsinhStr,
    gioitinh: form.gioitinh?.trim() || null,
  };

  try {
    if (isEditing) {
      const updated = await updateBenhNhan(finalForm);
      if (successToast) toast.success('Đã cập nhật bệnh nhân');
      return { ok: true, mode: 'update', patient: updated };
    }
    const created = await createBenhNhan(finalForm);
    if (successToast) toast.success('Đã thêm bệnh nhân');
    return { ok: true, mode: 'create', patient: created };
  } catch (error: unknown) {
    toast.error(`Lỗi: ${formatApiError(error)}`);
    return { ok: false };
  }
}
