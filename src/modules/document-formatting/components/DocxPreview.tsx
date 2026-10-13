import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, FileText, CheckCircle2, Upload } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { Button } from '../../../components/ui/Button';
import { eventBus } from '../../../core/events/eventBus';
import { type DocxParagraphInfo } from '../../../../shared/contracts/formattingProfiles';

interface DocxPreviewProps {
  docBlob: Blob | null;
  paragraphs?: DocxParagraphInfo[];
  selectedParagraphId?: string | null;
  onSelectParagraph?: (pId: string) => void;
  fileName?: string;
  hasErrors?: boolean;
}

export function DocxPreview({
  docBlob,
  paragraphs = [],
  selectedParagraphId,
  onSelectParagraph,
  fileName,
  hasErrors = false,
}: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderSuccess, setRenderSuccess] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'structure'>('visual');

  useEffect(() => {
    let active = true;
    if (!docBlob || !containerRef.current) return;

    setRenderError(null);
    setRenderSuccess(false);

    // Clear previous render
    containerRef.current.innerHTML = '';

    const render = async () => {
      try {
        await renderAsync(docBlob, containerRef.current!, undefined, {
          className: 'docx-preview-content',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          useBase64URL: false,
        });
        if (active) setRenderSuccess(true);
      } catch (err: any) {
        console.warn('Docx visual render fallback to structure view:', err);
        if (active) {
          setRenderError('Bản xem trước trực quan cần tải tệp hoàn chỉnh; chế độ cấu trúc văn bản đang được kích hoạt.');
          setViewMode('structure');
        }
      }
    };

    void render();
    return () => {
      active = false;
    };
  }, [docBlob]);

  return (
    <div className="flex h-full flex-col bg-neutral-100 overflow-hidden">
      {/* Preview Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-600">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800 truncate max-w-[200px]">
            {fileName || 'Chưa chọn tài liệu'}
          </span>
          {renderSuccess && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Chuẩn Word
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'visual' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Trang A4
            </button>
            <button
              type="button"
              onClick={() => setViewMode('structure')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'structure' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Cấu trúc ({paragraphs.length})
            </button>
          </div>

          <div className="h-4 w-px bg-neutral-200" />

          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(z => Math.max(50, z - 15))}
            disabled={zoom <= 50}
            className="h-7 w-7 p-0"
            title="Thu nhỏ"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-10 text-center font-mono text-[11px] text-neutral-700">{zoom}%</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(z => Math.min(175, z + 15))}
            disabled={zoom >= 175}
            className="h-7 w-7 p-0"
            title="Phóng to"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(100)}
            className="h-7 w-7 p-0"
            title="Đặt lại zoom 100%"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Accuracy advisory notice */}
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-1.5 text-[11px] text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          Bản xem trước trên trình duyệt là mô phỏng bố cục. Tệp DOCX tải về khi mở trên Microsoft Word sẽ luôn áp dụng chuẩn xác 100% các quy định thể thức.
        </span>
      </div>

      {/* Main Canvas View */}
      <div className="relative flex-1 overflow-auto p-6 flex justify-center items-start">
        {viewMode === 'visual' ? (
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
            }}
            className="min-h-[1123px] w-[794px] shrink-0 rounded-sm bg-white p-12 shadow-md border border-neutral-200/80"
          >
            <div ref={containerRef} className="docx-render-viewport text-neutral-800 text-sm leading-relaxed" />
            {!docBlob && (
              <div className="flex h-96 flex-col items-center justify-center text-center text-neutral-400">
                <FileText className="h-12 w-12 stroke-1 mb-2 text-neutral-300" />
                <p className="text-sm font-medium text-neutral-500">Chưa có tài liệu được chọn</p>
                <p className="text-xs text-neutral-400 max-w-xs mt-1">
                  Vui lòng tải lên tệp .docx hoặc chọn từ danh sách tài liệu bên trái để xem trước và định dạng.
                </p>
                <div className="mt-4">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => eventBus.emit('workspace:open-upload-modal', {})}
                    className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Upload className="h-3.5 w-3.5" /> Tải lên tài liệu Word (.docx)
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Structure Paragraph by Paragraph View */
          <div className="w-full max-w-3xl space-y-3 pb-12">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-2xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                Danh sách các đoạn văn bản ({paragraphs.length} đoạn)
              </h4>
              <div className="divide-y divide-neutral-100">
                {paragraphs.map((p) => {
                  const isSelected = selectedParagraphId === p.paragraphId;
                  return (
                    <div
                      key={p.paragraphId}
                      onClick={() => onSelectParagraph?.(p.paragraphId)}
                      className={`group flex items-start gap-3 p-3 transition-colors cursor-pointer rounded-md ${
                        isSelected
                          ? 'bg-blue-50/70 border border-blue-200'
                          : 'hover:bg-neutral-50 border border-transparent'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold text-neutral-400 group-hover:text-neutral-700 shrink-0 mt-0.5">
                        {p.paragraphId}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-800 line-clamp-3 leading-relaxed">
                          {p.text || <span className="italic text-neutral-400">(Đoạn trống)</span>}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">
                            Căn lề: {p.directAlignment || 'Kế thừa style'}
                          </span>
                          {p.fontName && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">
                              Font: {p.fontName}
                            </span>
                          )}
                          {p.fontSizePt && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">
                              Cỡ: {p.fontSizePt}pt
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
