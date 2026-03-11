import { useEffect, useState } from "react"
import { getDonThuocByBenhNhan } from "@/lib/api/thuoc"
import { DonThuoc } from "@prisma/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface QuaTrinhDieuTriProps {
  benhNhanId: string
}

export default function QuaTrinhDieuTri({ benhNhanId }: QuaTrinhDieuTriProps) {
  const [donThuocList, setDonThuocList] = useState<DonThuoc[]>([])
  const [loading, setLoading] = useState(false)
  const [donXemLai, setDonXemLai] = useState<DonThuoc | null>(null)
  const [openDialog, setOpenDialog] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const data = await getDonThuocByBenhNhan(benhNhanId)
      setDonThuocList(data || [])
      setLoading(false)
    }
    if (benhNhanId) fetchData()
  }, [benhNhanId])

  return (
    <div className="h-full flex flex-col">
      <div className="font-semibold text-sm mb-2">Quá trình điều trị</div>
      <ScrollArea className="flex-1 border rounded-md">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>
        ) : donThuocList.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Chưa có đơn thuốc</div>
        ) : (
          <div className="p-2 space-y-1">
            {donThuocList.map((don) => (
              <div
                key={don.id}
                className="cursor-pointer hover:bg-muted p-2 rounded"
                onClick={() => {
                  setDonXemLai(don)
                  setOpenDialog(true)
                }}
              >
                <div className="text-sm font-medium">
                  {new Date(don.ngay).toLocaleDateString("vi-VN")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {don.chanDoan || "Không có chẩn đoán"}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={openDialog} onOpenChange={(open) => {
        setOpenDialog(open)
        if (!open) setDonXemLai(null)
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Đơn thuốc ngày {donXemLai && new Date(donXemLai.ngay).toLocaleDateString("vi-VN")}</DialogTitle>
          </DialogHeader>
          {donXemLai && (
            <div className="space-y-2 text-sm">
              <div><strong>Chẩn đoán:</strong> {donXemLai.chanDoan || "Không có"}</div>
              <div><strong>Diễn tiến:</strong> {donXemLai.dienTien || "Không có"}</div>
              <div>
                <strong>Danh sách thuốc:</strong>
                <ul className="list-disc pl-5 mt-1">
                  {donXemLai.thuoc?.map((t, i) => (
                    <li key={i}>
                      {t.ten} - {t.lieuDung} - SL: {t.soLuong} {t.ghiChu ? `(${t.ghiChu})` : ""}
                    </li>
                  )) || <li>Không có thuốc</li>}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
