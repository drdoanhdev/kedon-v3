import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/tenantApi';

interface PatientData {
  patient_id: string;
  name: string;
  timestamp: string;
  action: string;
  phone?: string;
  note?: string;
  image_data?: string; // Base64 avatar image
}

interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const supabase = supabaseAdmin;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { 
        patient_id, 
        name, 
        timestamp, 
        action, 
        phone, 
        note, 
        image_data 
      }: PatientData = req.body;

      if (!patient_id || !name || !timestamp || !action) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc (patient_id, name, timestamp, action)'
        });
      }

      console.log('📥 Nhận dữ liệu từ camera nhận diện:', {
        patient_id,
        name,
        action,
        timestamp: new Date(timestamp).toLocaleString('vi-VN')
      });

      // Kiểm tra bệnh nhân tồn tại trong database
      const { data: patient, error: patientError } = await supabase
        .from('BenhNhan')
        .select('id, ten, dienthoai')
        .eq('id', parseInt(patient_id))
        .single();

      if (patientError || !patient) {
        console.log('⚠️ Bệnh nhân không tồn tại trong hệ thống:', patient_id);
        return res.status(404).json({
          success: false,
          message: `Bệnh nhân với ID ${patient_id} không tồn tại trong hệ thống`
        });
      }

      // Kiểm tra đã có trong danh sách chờ hôm nay chưa
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existing } = await supabase
        .from('ChoKham')
        .select('id, thoigian')
        .eq('benhnhanid', parseInt(patient_id))
        .gte('thoigian', today.toISOString())
        .eq('trangthai', 'chờ')
        .single();

      if (existing) {
        // Nếu đã có trong danh sách, cập nhật avatar nếu có
        if (image_data) {
          await supabase
            .from('ChoKham')
            .update({ avatar_url: image_data })
            .eq('id', existing.id);
        }

        console.log('ℹ️ Bệnh nhân đã có trong danh sách chờ:', patient.ten);
        return res.status(200).json({
          success: true,
          message: `Bệnh nhân ${patient.ten} đã có trong danh sách chờ`,
          data: {
            patient_id: patient.id,
            name: patient.ten,
            status: 'already_in_queue',
            queue_id: existing.id
          }
        });
      }

      // Thêm mới vào danh sách chờ
      const { data: newRecord, error: insertError } = await supabase
        .from('ChoKham')
        .insert({
          benhnhanid: parseInt(patient_id),
          thoigian: new Date().toISOString(),
          trangthai: 'chờ',
          avatar_url: image_data || null
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Lỗi khi thêm vào danh sách chờ:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Lỗi khi thêm vào danh sách chờ',
          error: insertError.message
        });
      }

      console.log('✅ Đã thêm bệnh nhân vào danh sách chờ:', patient.ten);
      
      return res.status(200).json({
        success: true,
        message: `✅ Đã thêm ${patient.ten} vào danh sách chờ khám`,
        data: {
          patient_id: patient.id,
          name: patient.ten,
          phone: patient.dienthoai,
          queue_id: newRecord.id,
          received_at: new Date().toISOString(),
          action,
          status: 'added_to_queue'
        }
      });

    } catch (error) {
      console.error('❌ Lỗi xử lý nhận diện:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi xử lý nhận diện',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } 
  else if (req.method === 'GET') {
    res.status(200).json({
      success: true,
      message: 'API Nhận diện bệnh nhân - Tự động thêm vào danh sách chờ',
      data: {
        version: '2.0.0',
        endpoints: {
          POST: 'Nhận dữ liệu nhận diện và thêm vào danh sách chờ',
          GET: 'Thông tin API'
        },
        required_fields: ['patient_id', 'name', 'timestamp', 'action'],
        optional_fields: ['phone', 'note', 'image_data']
      }
    });
  }
  else {
    res.status(405).json({
      success: false,
      message: `Method ${req.method} không được hỗ trợ`
    });
  }
}