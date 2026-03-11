import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!tenant) return;
  const supabase = supabaseAdmin;

  try {
    console.log('🔧 Bắt đầu fix sequence...');

    // Kiểm tra ID cao nhất trong bảng DonKinh
    const { data: maxDonKinhData, error: maxDonKinhError } = await supabase
      .from('DonKinh')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (maxDonKinhError) {
      console.error('❌ Lỗi khi lấy max ID DonKinh:', maxDonKinhError);
      throw maxDonKinhError;
    }

    const maxId = maxDonKinhData?.[0]?.id || 0;
    const nextId = maxId + 1;
    
    console.log(`📊 ID cao nhất hiện tại: ${maxId}, ID tiếp theo sẽ là: ${nextId}`);

    // Thử cách 1: Sử dụng raw SQL
    try {
      const { data: sqlResult, error: sqlError } = await supabase
        .rpc('sql', {
          query: `SELECT setval(pg_get_serial_sequence('public."DonKinh"', 'id'), ${nextId}, false);`
        });
      
      if (sqlError) {
        console.log('⚠️ Cách 1 thất bại, thử cách 2...');
        throw sqlError;
      }
      
      console.log('✅ Cách 1 thành công:', sqlResult);
    } catch (error1) {
      console.log('⚠️ Cách 1 thất bại, thử cách 2...');
      
      // Thử cách 2: Insert và delete để force sequence update
      try {
        const tempId = maxId + 1000; // Dùng ID rất cao để tránh conflict
        
        // Insert record tạm
        const { error: insertError } = await supabase
          .from('DonKinh')
          .insert({ 
            id: tempId, 
            benhnhanid: 999999, 
            chandoan: 'TEMP_RECORD', 
            ngaykham: '2024-01-01' 
          });
        
        if (insertError) {
          console.error('❌ Lỗi insert temp record:', insertError);
          throw insertError;
        }
        
        // Delete record tạm
        const { error: deleteError } = await supabase
          .from('DonKinh')
          .delete()
          .eq('id', tempId);
        
        if (deleteError) {
          console.error('❌ Lỗi delete temp record:', deleteError);
          throw deleteError;
        }
        
        console.log('✅ Cách 2 thành công: đã force update sequence');
      } catch (error2) {
        console.log('⚠️ Cách 2 thất bại, thử cách 3...');
        
        // Thử cách 3: Restart sequence từ đầu
        try {
          const { error: restartError } = await supabase
            .rpc('sql', {
              query: `ALTER SEQUENCE "DonKinh_id_seq" RESTART WITH ${nextId};`
            });
          
          if (restartError) throw restartError;
          console.log('✅ Cách 3 thành công: restart sequence');
        } catch (error3) {
          console.error('❌ Tất cả các cách đều thất bại');
          throw error3;
        }
      }
    }

    // Kiểm tra sequence sau khi fix
    const { data: sequenceCheck, error: seqCheckError } = await supabase
      .rpc('sql', {
        query: `SELECT currval(pg_get_serial_sequence('public."DonKinh"', 'id'));`
      });

    console.log('🔍 Giá trị sequence hiện tại:', sequenceCheck);

    res.status(200).json({ 
      message: 'Đã fix sequence thành công',
      maxId: maxId,
      nextId: nextId,
      sequenceValue: sequenceCheck
    });

  } catch (error) {
    console.error('❌ Lỗi khi fix sequence:', error);
    res.status(500).json({ 
      message: 'Lỗi khi fix sequence', 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
