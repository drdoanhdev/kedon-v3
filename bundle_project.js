const fs = require('fs').promises;
const path = require('path');

// Thư mục dự án cần tổng hợp (thay bằng thư mục dự án của bạn nếu cần)
const projectDir = path.join(__dirname);
// Đường dẫn file đầu ra
const outputFile = path.join(__dirname, 'project_summary.txt');
// Các loại file cần tổng hợp (thêm hoặc bớt theo nhu cầu)
const fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json'];

// Hàm kiểm tra xem file có nằm trong danh sách loại file cần tổng hợp không
function isValidFile(file) {
  return fileExtensions.includes(path.extname(file).toLowerCase());
}

// Hàm đệ quy để quét tất cả file trong thư mục
async function getAllFiles(dir, fileList = []) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      // Bỏ qua các thư mục không cần thiết
      if (['node_modules', '.git', 'dist', 'build'].includes(file.name)) {
        continue;
      }
      await getAllFiles(filePath, fileList);
    } else if (isValidFile(file.name)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// Hàm chính để tổng hợp nội dung
async function bundleProject() {
  try {
    console.log('Đang quét dự án...');
    const files = await getAllFiles(projectDir);
    
    let outputContent = '# Tổng hợp code dự án\n\n';
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(__dirname, file);
        outputContent += `## File: ${relativePath}\n\n`;
        outputContent += '```' + path.extname(file).slice(1) + '\n';
        outputContent += content + '\n';
        outputContent += '```\n\n';
      } catch (error) {
        console.error(`Lỗi khi đọc file ${file}:`, error);
      }
    }
    
    await fs.writeFile(outputFile, outputContent);
    console.log(`Đã tạo file tổng hợp tại: ${outputFile}`);
  } catch (error) {
    console.error('Lỗi khi tổng hợp dự án:', error);
  }
}

// Chạy hàm
bundleProject();