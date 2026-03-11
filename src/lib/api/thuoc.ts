import axios from 'axios';

// Function to get don thuoc by benh nhan with cache-busting
export const getDonThuocByBenhNhan = async (benhNhanId: number) => {
  try {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const response = await axios.get(`/api/don-thuoc?benhnhanid=${benhNhanId}&limit=20&_t=${timestamp}&_r=${random}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching don thuoc by benh nhan:', error);
    return [];
  }
};
