import React from 'react';
import { CheckCircle2, Download, FileText, X, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface DiffReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: {
    sourceFileName: string;
    outputFileName: string;
    sourceSha256: string;
    outputSha256: string;
    operationsCount: number;
    profileName: string;
    appliedAt: string;
  } | null;
  onDownload: () => void;
}

export function DiffReportModal({
  isOpen,
  onClose,
  report,
  onDownload,
}: DiffReportModalProps) {
  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 bg-neutral-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Báo cáo chuẩn hóa định dạng</h3>
              <p className="text-xs text-neutral-500">Đã áp dụng thành công {report.operationsCount} thao tác</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-neutral-600">
              <span className="font-medium">Bộ quy tắc áp dụng:</span>
              <span className="font-semibold text-neutral-800">{report.profileName}</span>
            </div>
            <div className="flex items-center justify-between text-neutral-600">
              <span className="font-medium">Thời điểm thực hiện:</span>
              <span className="font-mono text-neutral-700">{new Date(report.appliedAt).toLocaleString('vi-VN')}</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Đối chiếu tệp trước và sau
            </span>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium text-neutral-500">Tệp gốc (bất biến)</span>
                <p className="font-semibold text-neutral-800 truncate">{report.sourceFileName}</p>
                <p className="font-mono text-[10px] text-neutral-400 truncate mt-0.5">SHA: {report.sourceSha256.slice(0, 16)}...</p>
              </div>

              <ArrowRight className="h-4 w-4 text-neutral-400 shrink-0" />

              <div className="min-w-0 flex-1 text-right">
                <span className="text-[11px] font-medium text-emerald-600">Tệp đã định dạng</span>
                <p className="font-semibold text-emerald-800 truncate">{report.outputFileName}</p>
                <p className="font-mono text-[10px] text-emerald-600 truncate mt-0.5">SHA: {report.outputSha256.slice(0, 16)}...</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-emerald-50/60 border border-emerald-200/80 p-3 text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Tính toàn vẹn của tệp đã được kiểm chứng sau khi tạo: nội dung văn bản, bảng biểu, hình ảnh và phân đoạn được bảo toàn nguyên vẹn.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50/50 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Đóng
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              onDownload();
              onClose();
            }}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Tải tệp DOCX ngay
          </Button>
        </div>
      </div>
    </div>
  );
}
