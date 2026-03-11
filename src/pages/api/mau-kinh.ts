// API endpoint cho mẫu thị lực và số kính
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  try {
    if (req.method === 'GET') {
      const { type } = req.query;
      
      if (type === 'thiluc') {
        const { data, error } = await supabase
          .from('MauThiLuc')
          .select('*')
          .order('thu_tu');

        if (error) throw error;
        return res.status(200).json(data);
      }
      
      if (type === 'sokinh') {
        const { data, error } = await supabase
          .from('MauSoKinh')
          .select('*')
          .order('thu_tu');

        if (error) throw error;
        return res.status(200).json(data);
      }

      return res.status(400).json({ message: 'Missing type parameter' });
    }

    if (req.method === 'POST') {
      console.log('POST request body:', req.body);
      const { type, gia_tri, so_kinh, thu_tu } = req.body;
      
      if (type === 'thiluc') {
        const insertData = { gia_tri, thu_tu: parseInt(thu_tu) || 0 };
        console.log('Inserting MauThiLuc:', insertData);
        const { data, error } = await supabase
          .from('MauThiLuc')
          .insert(insertData)
          .select();

        if (error) throw error;
        return res.status(200).json(data[0]);
      }
      
      if (type === 'sokinh') {
        const insertData = { so_kinh, thu_tu: parseInt(thu_tu) || 0 };
        console.log('Inserting MauSoKinh:', insertData);
        const { data, error } = await supabase
          .from('MauSoKinh')
          .insert(insertData)
          .select();

        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        return res.status(200).json(data[0]);
      }

      return res.status(400).json({ message: 'Invalid type' });
    }

    if (req.method === 'PUT') {
      const { type, id, gia_tri, so_kinh, thu_tu } = req.body;
      
      if (type === 'thiluc') {
        const { data, error } = await supabase
          .from('MauThiLuc')
          .update({ gia_tri, thu_tu: parseInt(thu_tu) || 0 })
          .eq('id', id)
          .select();

        if (error) throw error;
        return res.status(200).json(data[0]);
      }
      
      if (type === 'sokinh') {
        const { data, error } = await supabase
          .from('MauSoKinh')
          .update({ so_kinh, thu_tu: parseInt(thu_tu) || 0 })
          .eq('id', id)
          .select();

        if (error) throw error;
        return res.status(200).json(data[0]);
      }

      return res.status(400).json({ message: 'Invalid type' });
    }

    if (req.method === 'DELETE') {
      const { type, id } = req.query;
      
      console.log('DELETE request:', { type, id });
      
      if (!type || !id) {
        return res.status(400).json({ message: 'Missing type or id' });
      }
      
      if (type === 'thiluc') {
        console.log('Deleting from MauThiLuc with id:', id);
        const { error } = await supabase
          .from('MauThiLuc')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        return res.status(200).json({ message: 'Đã xóa mẫu thị lực' });
      }
      
      if (type === 'sokinh') {
        console.log('Deleting from MauSoKinh with id:', id);
        const { error } = await supabase
          .from('MauSoKinh')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        return res.status(200).json({ message: 'Đã xóa mẫu số kính' });
      }

      return res.status(400).json({ message: 'Invalid type' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
