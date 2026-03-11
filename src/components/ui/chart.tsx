import React from 'react';

interface ChartDataItem {
  label: string;
  value: number;
  tooltip?: string;
  secondaryValue?: number;
}

interface ChartProps {
  data: ChartDataItem[];
  title: string;
  valueLabel: string;
  color?: string;
  height?: number;
  maxItems?: number;
  showSecondaryValue?: boolean;
  className?: string;
  stackedMode?: boolean; // Chế độ xếp chồng: cột lãi (xanh) nằm trước cột doanh thu (cam)
}

export function BarChart({ 
  data, 
  title, 
  valueLabel, 
  color = 'blue', 
  height = 200,
  maxItems = 20,
  showSecondaryValue = false,
  stackedMode = false,
  className = ""
}: ChartProps) {
  const displayData = data.slice(0, maxItems);
  
  // Tính max value cho biểu đồ
  const maxValue = stackedMode 
    ? Math.max(...displayData.map(d => d.secondaryValue || 0)) // Dùng doanh thu (secondaryValue) làm max cho stacked mode
    : Math.max(...displayData.map(d => d.value));
  
  if (displayData.length === 0) {
    return (
      <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center ${className}`}>
        <div className="text-yellow-600 mb-2">📊 Không có dữ liệu để hiển thị biểu đồ</div>
        <div className="text-sm text-gray-600">Hãy thử thay đổi khoảng thời gian hoặc kiểm tra dữ liệu trong hệ thống</div>
      </div>
    );
  }

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          gradient: 'from-green-600 via-green-500 to-green-400',
          hover: 'hover:from-green-700 hover:via-green-600 hover:to-green-500'
        };
      case 'purple':
        return {
          gradient: 'from-purple-600 via-purple-500 to-purple-400',
          hover: 'hover:from-purple-700 hover:via-purple-600 hover:to-purple-500'
        };
      case 'orange':
        return {
          gradient: 'from-orange-600 via-orange-500 to-orange-400',
          hover: 'hover:from-orange-700 hover:via-orange-600 hover:to-orange-500'
        };
      default:
        return {
          gradient: 'from-blue-600 via-blue-500 to-blue-400',
          hover: 'hover:from-blue-700 hover:via-blue-600 hover:to-blue-500'
        };
    }
  };

  const colorClasses = getColorClasses(color);

  return (
    <div className={className}>
      <h3 className="text-xs lg:text-sm font-medium text-gray-700 mb-3">{title}</h3>
      
      {/* Chart container với padding top để tránh label bị cắt */}
      <div className="bg-gray-50 p-3 lg:p-4 rounded overflow-x-auto">
        <div 
          className="flex items-end justify-start space-x-1 lg:space-x-2 min-w-full pb-2"
          style={{ height: `${height}px`, paddingTop: '24px' }} // Thêm padding top cho labels
        >
          {displayData.map((item, index) => {
            if (stackedMode && item.secondaryValue !== undefined) {
              // Chế độ xếp chồng: Cột lãi (xanh da trời) + Cột doanh thu (cam)
              const laiHeight = maxValue > 0 ? Math.max((item.value / maxValue) * (height - 50), 8) : 8;
              const doanhThuHeight = maxValue > 0 ? Math.max((item.secondaryValue / maxValue) * (height - 50), 8) : 8;
              
              const displayLai = item.value > 999 ? `${(item.value / 1000).toFixed(0)}k` : item.value.toString();
              const displayDoanhThu = item.secondaryValue > 999 ? `${(item.secondaryValue / 1000).toFixed(0)}k` : item.secondaryValue.toString();
              
              return (
                <div key={index} className="flex flex-col items-center flex-shrink-0 group relative">
                  {/* Doanh thu label (cam) - trên cùng */}
                  <div 
                    className="text-xs text-orange-700 font-medium text-center min-w-[24px] lg:min-w-[28px] absolute bg-orange-50 px-1 rounded shadow-sm border border-orange-200"
                    style={{ 
                      top: '-20px',
                      zIndex: 10,
                      fontSize: '10px'
                    }}
                  >
                    {displayDoanhThu}
                  </div>
                  
                  {/* Lãi label (xanh) - dưới doanh thu */}
                  <div 
                    className="text-xs text-sky-700 font-medium text-center min-w-[24px] lg:min-w-[28px] absolute bg-sky-50 px-1 rounded shadow-sm border border-sky-200"
                    style={{ 
                      top: '2px',
                      zIndex: 9,
                      fontSize: '9px'
                    }}
                  >
                    {displayLai}
                  </div>
                  
                  {/* Container chứa 2 cột xếp chồng */}
                  <div className="relative flex flex-col items-center" style={{ marginTop: '24px' }}>
                    {/* Cột doanh thu (cam) - nằm phía sau */}
                    <div
                      className="bg-orange-500 w-8 lg:w-10 transition-all duration-200 hover:bg-orange-600 cursor-pointer shadow-md absolute bottom-0"
                      style={{ height: `${doanhThuHeight}px`, zIndex: 1 }}
                      title={`Doanh thu: ${displayDoanhThu} ${valueLabel}`}
                    />
                    
                    {/* Cột lãi (xanh da trời) - nằm phía trước */}
                    <div
                      className="bg-sky-500 w-8 lg:w-10 transition-all duration-200 hover:bg-sky-600 cursor-pointer shadow-lg relative"
                      style={{ height: `${laiHeight}px`, zIndex: 2 }}
                      title={`Lãi: ${displayLai} ${valueLabel}`}
                    />
                  </div>
                  
                  {/* Date label */}
                  <div className="text-xs text-gray-500 text-center min-w-[24px] lg:min-w-[28px] leading-tight mt-1">
                    {item.label.includes('/') ? (
                      <>
                        {item.label.split('/')[0]}<br/>{item.label.split('/')[1]}
                      </>
                    ) : (
                      <span className="text-xs">{item.label}</span>
                    )}
                  </div>
                </div>
              );
            } else {
              // Chế độ thông thường - giữ nguyên code cũ
              const barHeight = maxValue > 0 ? Math.max((item.value / maxValue) * (height - 50), 8) : 8;
              const displayValue = item.value > 999 ? `${(item.value / 1000).toFixed(0)}k` : item.value.toString();
              
              return (
                <div key={index} className="flex flex-col items-center flex-shrink-0 group relative">
                  {/* Value label - positioned absolutely để không bị cắt */}
                  <div 
                    className="text-xs text-gray-600 font-medium text-center min-w-[24px] lg:min-w-[28px] absolute bg-white px-1 rounded shadow-sm border"
                    style={{ 
                      top: '-20px',
                      zIndex: 10,
                      fontSize: '10px'
                    }}
                  >
                    {displayValue}
                  </div>
                  
                  {/* Secondary value (if enabled) */}
                  {showSecondaryValue && item.secondaryValue !== undefined && (
                    <div 
                      className="text-xs text-purple-600 font-medium text-center min-w-[24px] lg:min-w-[28px] absolute bg-purple-50 px-1 rounded shadow-sm border border-purple-200"
                      style={{ 
                        top: '2px',
                        zIndex: 9,
                        fontSize: '9px'
                      }}
                    >
                      {item.secondaryValue > 999 ? `${(item.secondaryValue / 1000).toFixed(0)}k` : item.secondaryValue}
                    </div>
                  )}
                  
                  {/* Bar */}
                  <div
                    className={`bg-gradient-to-t ${colorClasses.gradient} rounded-t w-5 lg:w-6 transition-all duration-200 ${colorClasses.hover} cursor-pointer shadow-sm`}
                    style={{ height: `${barHeight}px`, marginTop: showSecondaryValue ? '20px' : '8px' }}
                    title={item.tooltip || `${item.label}: ${displayValue} ${valueLabel}`}
                  />
                  
                  {/* Date label */}
                  <div className="text-xs text-gray-500 text-center min-w-[24px] lg:min-w-[28px] leading-tight mt-1">
                    {item.label.includes('/') ? (
                      <>
                        {item.label.split('/')[0]}<br/>{item.label.split('/')[1]}
                      </>
                    ) : (
                      <span className="text-xs">{item.label}</span>
                    )}
                  </div>
                </div>
              );
            }
          })}
        </div>
      </div>
      
      {/* Chart info */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>📊 {data.length} mục có dữ liệu</span>
        {data.length > maxItems && (
          <span>* Hiển thị {maxItems} mục gần nhất</span>
        )}
      </div>
    </div>
  );
}
