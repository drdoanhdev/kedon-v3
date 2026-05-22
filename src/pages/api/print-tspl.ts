import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { requireFeature, requireTenant, setNoCacheHeaders } from '../../lib/tenantApi';

type ExecResult = {
  stdout: string;
  stderr: string;
};

type PrintRequestBody = {
  mode?: 'tspl' | 'bitmap';
  printerName?: string;
  tspl?: string;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  gapMm?: number;
  speed?: number;
  density?: number;
  copies?: number;
  bitmapOffsetXmm?: number;
  bitmapOffsetYmm?: number;
  widthBytes?: number;
  heightDots?: number;
  bitmapBase64?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function runPowerShell(command: string, envExtra?: Record<string, string>): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          ...envExtra,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

const LIST_PRINTERS_SCRIPT = `
$ErrorActionPreference = "Stop"
$printers = @()
try {
  $printers = Get-Printer | Select-Object -ExpandProperty Name
} catch {
  $printers = Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name
}
$defaultPrinter = $null
try {
  $defaultPrinter = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)
} catch {
  $defaultPrinter = $null
}
[PSCustomObject]@{ printers = $printers; defaultPrinter = $defaultPrinter } | ConvertTo-Json -Compress
`;

const RAW_PRINT_SCRIPT = `
$ErrorActionPreference = "Stop"
$printerName = $env:PRINTER_NAME
$filePath = $env:TSPL_FILE
if ([string]::IsNullOrWhiteSpace($printerName)) {
  throw "PRINTER_NAME is empty"
}
if ([string]::IsNullOrWhiteSpace($filePath) -or -not (Test-Path -LiteralPath $filePath)) {
  throw "TSPL file not found"
}
$bytes = [System.IO.File]::ReadAllBytes($filePath)
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
        IntPtr pBytes = IntPtr.Zero;
        IntPtr hPrinter = IntPtr.Zero;

        var di = new DOCINFOA();
        di.pDocName = "TSPL Job";
        di.pDataType = "RAW";

        try
        {
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
                return Marshal.GetLastWin32Error();

            if (!StartDocPrinter(hPrinter, 1, di))
                return Marshal.GetLastWin32Error();

            if (!StartPagePrinter(hPrinter))
                return Marshal.GetLastWin32Error();

            pBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pBytes, bytes.Length);

            Int32 dwWritten = 0;
            if (!WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten))
                return Marshal.GetLastWin32Error();

            if (dwWritten != bytes.Length)
                return -10001;

            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return 0;
        }
        finally
        {
            if (pBytes != IntPtr.Zero)
                Marshal.FreeCoTaskMem(pBytes);
            if (hPrinter != IntPtr.Zero)
                ClosePrinter(hPrinter);
        }
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$result = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)
if ($result -ne 0) {
  throw "RAW print failed with code $result"
}
Write-Output "OK"
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (process.platform !== 'win32') {
    return res.status(501).json({ error: 'In trực tiếp chỉ hỗ trợ khi server chạy trên Windows.' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'print_config'))) return;

  if (req.method === 'GET') {
    try {
      const { stdout } = await runPowerShell(LIST_PRINTERS_SCRIPT);
      const parsed = JSON.parse(stdout.trim() || '{}') as { printers?: string[] | string; defaultPrinter?: string | null };

      const printersRaw = parsed?.printers;
      const printers = Array.isArray(printersRaw)
        ? printersRaw.filter((item) => typeof item === 'string' && item.trim())
        : typeof printersRaw === 'string' && printersRaw.trim()
          ? [printersRaw.trim()]
          : [];

      const defaultPrinter = typeof parsed?.defaultPrinter === 'string' ? parsed.defaultPrinter.trim() : null;

      return res.status(200).json({
        printers,
        defaultPrinter,
      });
    } catch (error: any) {
      const message = error?.message || 'Không tải được danh sách máy in.';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as PrintRequestBody;
    const mode = body.mode || 'bitmap';
    const printerName = String(body.printerName || '').trim();

    if (!printerName) {
      return res.status(400).json({ error: 'Thiếu tên máy in.' });
    }

    let rawPayload: Buffer;

    if (mode === 'bitmap') {
      const widthMm = asNumber(body.widthMm, 0);
      const heightMm = asNumber(body.heightMm, 0);
      const dpi = clamp(Math.round(asNumber(body.dpi, 203)), 200, 600);
      const gapMm = clamp(asNumber(body.gapMm, 2), 0, 10);
      const speed = clamp(Math.round(asNumber(body.speed, 4)), 1, 6);
      const density = clamp(Math.round(asNumber(body.density, 10)), 1, 15);
      const copies = clamp(Math.round(asNumber(body.copies, 1)), 1, 500);
      const bitmapOffsetXmm = clamp(asNumber(body.bitmapOffsetXmm, 0), -8, 8);
      const bitmapOffsetYmm = clamp(asNumber(body.bitmapOffsetYmm, 0), -8, 8);
      const widthBytes = Math.max(0, Math.round(asNumber(body.widthBytes, 0)));
      const heightDots = Math.max(0, Math.round(asNumber(body.heightDots, 0)));
      const bitmapBase64 = String(body.bitmapBase64 || '');

      if (!bitmapBase64 || widthBytes <= 0 || heightDots <= 0) {
        return res.status(400).json({ error: 'Thiếu dữ liệu bitmap.' });
      }
      if (widthMm <= 0 || heightMm <= 0) {
        return res.status(400).json({ error: 'Kích thước tem không hợp lệ.' });
      }

      const bitmapBytes = Buffer.from(bitmapBase64, 'base64');
      const expectedLength = widthBytes * heightDots;
      if (bitmapBytes.length !== expectedLength) {
        return res.status(400).json({ error: 'Kích thước dữ liệu bitmap không khớp.' });
      }

      const dotsPerMm = dpi / 25.4;
      const offsetX = Math.round(bitmapOffsetXmm * dotsPerMm);
      const offsetY = Math.round(bitmapOffsetYmm * dotsPerMm);

      const header = [
        `SIZE ${widthMm} mm,${heightMm} mm`,
        `GAP ${gapMm} mm,0 mm`,
        'OFFSET 0 mm',
        'SHIFT 0',
        'DIRECTION 0,0',
        'REFERENCE 0,0',
        `SPEED ${speed}`,
        `DENSITY ${density}`,
        'CLS',
        `BITMAP ${offsetX},${offsetY},${widthBytes},${heightDots},0,`,
      ].join('\r\n');
      const footer = `\r\nPRINT ${copies},1\r\n`;
      rawPayload = Buffer.concat([Buffer.from(header, 'ascii'), bitmapBytes, Buffer.from(footer, 'ascii')]);
    } else {
      const tspl = String(body.tspl || '');
      if (!tspl.trim()) {
        return res.status(400).json({ error: 'Thiếu dữ liệu TSPL.' });
      }
      if (tspl.length > 250000) {
        return res.status(400).json({ error: 'Lệnh TSPL quá lớn.' });
      }

      const normalized = tspl.replace(/\r?\n/g, '\r\n');
      rawPayload = Buffer.from(normalized, 'ascii');
    }

    const tempFile = path.join(os.tmpdir(), `tspl-${randomUUID()}.bin`);

    try {
      await fs.writeFile(tempFile, rawPayload);
      await runPowerShell(RAW_PRINT_SCRIPT, {
        PRINTER_NAME: printerName,
        TSPL_FILE: tempFile,
      });

      return res.status(200).json({
        message:
          mode === 'bitmap'
            ? `Đã gửi lệnh in bitmap trực tiếp tới máy in ${printerName}.`
            : `Đã gửi lệnh TSPL trực tiếp tới máy in ${printerName}.`,
      });
    } catch (error: any) {
      const message = error?.message || 'In trực tiếp thất bại.';
      return res.status(500).json({ error: message });
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
