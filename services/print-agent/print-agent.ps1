# Optigo Print Agent — lắng nghe localhost, liệt kê máy in và gửi lệnh TSPL/RAW.
# Chỉ bind 127.0.0.1 (không mở ra mạng LAN).

$ErrorActionPreference = 'Stop'
$Port = 9173
$Prefix = "http://127.0.0.1:$Port/"
$AllowedOrigins = @(
  'https://app.optigo.vn',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
)

function Write-AgentLog([string]$Message) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$ts] $Message"
}

function Get-CorsOrigin([System.Net.HttpListenerRequest]$Request) {
  $origin = [string]$Request.Headers['Origin']
  if ([string]::IsNullOrWhiteSpace($origin)) { return $null }
  if ($AllowedOrigins -contains $origin) { return $origin }
  return $null
}

function Set-CorsHeaders([System.Net.HttpListenerResponse]$Response, [System.Net.HttpListenerRequest]$Request) {
  $origin = Get-CorsOrigin $Request
  if ($origin) {
    $Response.Headers['Access-Control-Allow-Origin'] = $origin
    $Response.Headers['Vary'] = 'Origin'
  }
  $Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $Response.Headers['Access-Control-Max-Age'] = '86400'
}

function Send-Json([System.Net.HttpListenerResponse]$Response, [int]$StatusCode, $Object) {
  $json = $Object | ConvertTo-Json -Compress -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = 'application/json; charset=utf-8'
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Text([System.Net.HttpListenerResponse]$Response, [int]$StatusCode, [string]$Text, [string]$ContentType = 'text/plain; charset=utf-8') {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Get-InstalledPrinters {
  $printers = @()
  try {
    $printers = @(Get-Printer | Select-Object -ExpandProperty Name)
  } catch {
    $printers = @(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name)
  }

  $defaultPrinter = $null
  try {
    $defaultPrinter = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)
  } catch {
    $defaultPrinter = $null
  }

  return [PSCustomObject]@{
    printers = @($printers | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    defaultPrinter = $defaultPrinter
  }
}

function Send-BytesToPrinter([string]$PrinterName, [byte[]]$Bytes) {
  $code = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static int SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter = IntPtr.Zero;
        IntPtr pBytes = IntPtr.Zero;
        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Optigo Tem Kinh";
            di.pDataType = "RAW";
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return Marshal.GetLastWin32Error();
            if (!StartDocPrinter(hPrinter, 1, di)) return Marshal.GetLastWin32Error();
            if (!StartPagePrinter(hPrinter)) return Marshal.GetLastWin32Error();
            pBytes = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, pBytes, bytes.Length);
            int dwWritten;
            if (!WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten)) return Marshal.GetLastWin32Error();
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return 0;
        }
        finally
        {
            if (pBytes != IntPtr.Zero) Marshal.FreeHGlobal(pBytes);
            if (hPrinter != IntPtr.Zero) ClosePrinter(hPrinter);
        }
    }
}
"@
  if (-not ('RawPrinterHelper' -as [type])) {
    Add-Type -TypeDefinition $code -Language CSharp
  }
  return [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $Bytes)
}

function Build-BitmapPayload($Body) {
  $widthMm = [double]$Body.widthMm
  $heightMm = [double]$Body.heightMm
  $dpi = [Math]::Max(200, [Math]::Min(600, [int][Math]::Round([double]$Body.dpi)))
  $gapMm = [Math]::Max(0, [Math]::Min(10, [double]$Body.gapMm))
  $speed = [Math]::Max(1, [Math]::Min(6, [int][Math]::Round([double]$Body.speed)))
  $density = [Math]::Max(1, [Math]::Min(15, [int][Math]::Round([double]$Body.density)))
  $copies = [Math]::Max(1, [Math]::Min(500, [int][Math]::Round([double]$Body.copies)))
  $bitmapOffsetXmm = [Math]::Max(-8, [Math]::Min(8, [double]$Body.bitmapOffsetXmm))
  $bitmapOffsetYmm = [Math]::Max(-8, [Math]::Min(8, [double]$Body.bitmapOffsetYmm))
  $widthBytes = [Math]::Max(0, [int][Math]::Round([double]$Body.widthBytes))
  $heightDots = [Math]::Max(0, [int][Math]::Round([double]$Body.heightDots))
  $bitmapBase64 = [string]$Body.bitmapBase64

  if ([string]::IsNullOrWhiteSpace($bitmapBase64) -or $widthBytes -le 0 -or $heightDots -le 0) {
    throw 'Thieu du lieu bitmap.'
  }
  if ($widthMm -le 0 -or $heightMm -le 0) {
    throw 'Kich thuoc tem khong hop le.'
  }

  $bitmapBytes = [Convert]::FromBase64String($bitmapBase64)
  $expected = $widthBytes * $heightDots
  if ($bitmapBytes.Length -ne $expected) {
    throw 'Kich thuoc du lieu bitmap khong khop.'
  }
  if ($bitmapBytes.Length -gt 2MB) {
    throw 'Du lieu in qua lon.'
  }

  $dotsPerMm = $dpi / 25.4
  $offsetX = [int][Math]::Round($bitmapOffsetXmm * $dotsPerMm)
  $offsetY = [int][Math]::Round($bitmapOffsetYmm * $dotsPerMm)

  $header = @(
    "SIZE $widthMm mm,$heightMm mm",
    "GAP $gapMm mm,0 mm",
    'OFFSET 0 mm',
    'SHIFT 0',
    'DIRECTION 0,0',
    'REFERENCE 0,0',
    "SPEED $speed",
    "DENSITY $density",
    'CLS',
    "BITMAP $offsetX,$offsetY,$widthBytes,$heightDots,0,"
  ) -join "`r`n"
  $footer = "`r`nPRINT $copies,1`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $footerBytes = [System.Text.Encoding]::ASCII.GetBytes($footer)
  $payload = New-Object byte[] ($headerBytes.Length + $bitmapBytes.Length + $footerBytes.Length)
  [Array]::Copy($headerBytes, 0, $payload, 0, $headerBytes.Length)
  [Array]::Copy($bitmapBytes, 0, $payload, $headerBytes.Length, $bitmapBytes.Length)
  [Array]::Copy($footerBytes, 0, $payload, ($headerBytes.Length + $bitmapBytes.Length), $footerBytes.Length)
  return $payload
}

function Read-JsonBody([System.Net.HttpListenerRequest]$Request) {
  if ($Request.ContentLength64 -le 0) { return $null }
  if ($Request.ContentLength64 -gt 3MB) { throw 'Body qua lon.' }
  $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
  try {
    $raw = $reader.ReadToEnd()
  } finally {
    $reader.Close()
  }
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return $raw | ConvertFrom-Json
}

function Handle-Request([System.Net.HttpListenerContext]$Context) {
  $req = $Context.Request
  $res = $Context.Response
  try {
    Set-CorsHeaders $res $req

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Close()
      return
    }

    $path = $req.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($path)) { $path = '/' }

    if ($req.HttpMethod -eq 'GET' -and ($path -eq '/' -or $path -eq '/health')) {
      Send-Json $res 200 ([PSCustomObject]@{
        ok = $true
        name = 'Optigo Print Agent'
        version = '1.0.0'
        port = $Port
      })
      return
    }

    if ($req.HttpMethod -eq 'GET' -and $path -eq '/printers') {
      $list = Get-InstalledPrinters
      Send-Json $res 200 $list
      return
    }

    if ($req.HttpMethod -eq 'POST' -and $path -eq '/print') {
      $body = Read-JsonBody $req
      if (-not $body) { throw 'Thieu body JSON.' }

      $printerName = [string]$body.printerName
      if ([string]::IsNullOrWhiteSpace($printerName)) { throw 'Thieu ten may in.' }

      $mode = [string]$body.mode
      if ([string]::IsNullOrWhiteSpace($mode)) { $mode = 'bitmap' }

      if ($mode -eq 'bitmap') {
        $rawPayload = Build-BitmapPayload $body
      } elseif ($mode -eq 'tspl') {
        $tspl = [string]$body.tspl
        if ([string]::IsNullOrWhiteSpace($tspl)) { throw 'Thieu du lieu TSPL.' }
        if ($tspl.Length -gt 250000) { throw 'Lenh TSPL qua lon.' }
        $normalized = $tspl -replace "`r?`n", "`r`n"
        $rawPayload = [System.Text.Encoding]::ASCII.GetBytes($normalized)
      } else {
        throw 'mode khong hop le.'
      }

      $code = Send-BytesToPrinter $printerName.Trim() $rawPayload
      if ($code -ne 0) {
        throw "RAW print that bai (ma $code)."
      }

      Send-Json $res 200 ([PSCustomObject]@{
        message = "Da gui lenh in truc tiep toi may in $printerName."
      })
      return
    }

    Send-Json $res 404 ([PSCustomObject]@{ error = 'Khong tim thay endpoint.' })
  } catch {
    $message = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($message)) { $message = 'Loi khong xac dinh.' }
    Write-AgentLog "Loi: $message"
    try {
      Set-CorsHeaders $res $req
      Send-Json $res 500 ([PSCustomObject]@{ error = $message })
    } catch {
      # ignore secondary errors
    }
  } finally {
    try { $res.OutputStream.Close() } catch {}
    try { $res.Close() } catch {}
  }
}

# --- Main ---
Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '   Optigo Print Agent — In tem kinh' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "Agent dang chay tai: $Prefix"
Write-Host 'Hay de cua so nay mo trong khi in tem.'
Write-Host 'Bam Ctrl+C de dung.'
Write-Host ''

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)

try {
  $listener.Start()
} catch {
  Write-Host ''
  Write-Host 'KHONG MO DUOC CONG 9173.' -ForegroundColor Red
  Write-Host 'Thu dong cac cua so Optigo Print Agent dang mo, roi chay lai.'
  Write-Host $_.Exception.Message
  Write-Host ''
  Read-Host 'Bam Enter de thoat'
  exit 1
}

Write-AgentLog 'San sang. Mo app.optigo.vn/tem-kinh va bam Nạp lại máy in.'

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    Handle-Request $context
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
