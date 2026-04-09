// src/pages/api/benh-nhan/merge.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const { tenantId } = tenant;
  const supabase = supabaseAdmin;

  const { mainPatientId, patientIdsToMerge } = req.body;

  if (!mainPatientId || !patientIdsToMerge || !Array.isArray(patientIdsToMerge) || patientIdsToMerge.length < 1) {
    return res.status(400).json({ 
      message: 'Cần chọn một bệnh nhân chính và ít nhất một bệnh nhân để gộp.' 
    });
  }

  try {
    console.log('🔄 Starting patient merge process with RPC:', { mainPatientId, patientIdsToMerge });

    // Call the PostgreSQL function
    const { data, error } = await supabase.rpc('merge_patients', {
      p_main_patient_id: mainPatientId,
      p_merged_patient_ids: patientIdsToMerge,
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('❌ RPC Error:', error);
      throw new Error(`Lỗi từ database: ${error.message}`);
    }

    console.log('✅ RPC call completed successfully:', data);

    res.status(200).json({
      success: true,
      message: `Đã gộp thành công ${patientIdsToMerge.length} bệnh nhân vào bệnh nhân chính`,
      data: data
    });

  } catch (error: unknown) {
    console.error('❌ Error in merge handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({
      success: false,
      message: 'Lỗi khi gộp bệnh nhân: ' + errorMessage,
    });
  }
}
