const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');

// Đường dẫn đến thư mục chứa các file code cần theo dõi
const watchPath = path.join(__dirname, 'src'); // Thay 'src' bằng thư mục chứa code của bạn
const buildCommand = 'npm run build'; // Lệnh build dự án, thay bằng lệnh của bạn nếu khác
const restartCommand = 'npm run dev'; // Lệnh khởi động lại ứng dụng, thay bằng lệnh của bạn nếu khác

// Khởi tạo watcher
const watcher = chokidar.watch(watchPath, {
  ignored: /(^|[\/\\])\../, // Bỏ qua các file ẩn như .git, .env
  persistent: true
});

// Biến để kiểm soát trạng thái
let isProcessing = false;

// Hàm chạy lệnh shell
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi khi chạy lệnh ${command}:`, error);
        reject(error);
        return;
      }
      console.log(stdout);
      if (stderr) console.error(stderr);
      resolve();
    });
  });
}

// Xử lý sự kiện khi file thay đổi
watcher
  .on('change', async (filePath) => {
    if (isProcessing) return; // Tránh chạy đồng thời nhiều lần
    isProcessing = true;
    console.log(`File ${filePath} đã thay đổi`);
    
    try {
      console.log('Đang build lại dự án...');
      await runCommand(buildCommand);
      console.log('Build thành công!');
      
      console.log('Đang khởi động lại ứng dụng...');
      await runCommand(restartCommand);
      console.log('Khởi động lại thành công!');
    } catch (error) {
      console.error('Có lỗi xảy ra:', error);
    } finally {
      isProcessing = false;
    }
  })
  .on('error', (error) => console.error(`Lỗi watcher: ${error}`))
  .on('ready', () => console.log(`Đang theo dõi các file trong ${watchPath}`));