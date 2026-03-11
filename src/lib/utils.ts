import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Loại bỏ dấu tiếng Việt khỏi chuỗi
 * @param str - Chuỗi cần loại bỏ dấu
 * @returns Chuỗi đã loại bỏ dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  
  // Chuyển về lowercase trước
  str = str.toLowerCase();
  
  // Loại bỏ dấu
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  
  return str;
}

/**
 * Tìm kiếm thông minh: tìm từ bắt đầu với query (không phân biệt dấu)
 * Ví dụ: query "n" sẽ tìm được "nhung" nhưng không tìm được "chiến"
 * Hỗ trợ tìm nhiều từ: "bn th" sẽ tìm "bn tháng 11"
 * @param text - Văn bản cần tìm kiếm
 * @param query - Từ khóa tìm kiếm
 * @returns true nếu có từ nào đó trong text bắt đầu bằng query
 */
export function searchByStartsWith(text: string, query: string): boolean {
  if (!query || !text) return true;
  
  // Chuẩn hóa: loại bỏ dấu và chuyển về lowercase
  const normalizedText = removeVietnameseTones(text);
  const normalizedQuery = removeVietnameseTones(query).trim();
  
  if (!normalizedQuery) return true;
  
  // Tách text thành các từ (split by spaces and special characters)
  const textWords = normalizedText.split(/[\s,.-]+/).filter(w => w);
  
  // Tách query thành các từ để tìm nhiều từ
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w);
  
  // Kiểm tra từng từ trong query
  for (let i = 0; i < queryWords.length; i++) {
    const queryWord = queryWords[i];
    let found = false;
    
    // Tìm từ trong text bắt đầu bằng queryWord
    for (let j = 0; j < textWords.length; j++) {
      if (textWords[j].startsWith(queryWord)) {
        found = true;
        break;
      }
    }
    
    // Nếu không tìm thấy từ này, return false
    if (!found) return false;
  }
  
  // Tất cả các từ trong query đều tìm thấy
  return true;
}

/**
 * Viết hoa chữ cái đầu mỗi từ (Title Case)
 * @param str - Chuỗi cần format
 * @returns Chuỗi đã được viết hoa chữ cái đầu mỗi từ
 */
export function capitalizeWords(str: string): string {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
