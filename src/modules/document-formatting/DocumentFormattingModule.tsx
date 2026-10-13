import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Sliders,
  Download,
  Loader2,
  Layers,
  ChevronRight,
  Eye,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { authFetch } from '../../lib/authFetch';
import { readApiJson } from '../../lib/apiResponse';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { DocxPreview } from './components/DocxPreview';
import { IssuesList } from './components/IssuesList';
import { FormattingToolbar } from './components/FormattingToolbar';
import { DiffReportModal } from './components/DiffReportModal';
import {
  FORMATTING_PROFILES,
  type FormattingIssue,
  type FormattingPlan,
  type ProfileId,
  type DocxParagraphInfo,
} from '../../../shared/contracts/formattingProfiles';

interface StoredFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function DocumentFormattingModule() {
  const { user } = useFirebaseAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [selectedProfileId, setSelectedProfileId] = useState<ProfileId>('nghi-dinh-30');
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [docBlob, setDocBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [paragraphs, setParagraphs] = useState<DocxParagraphInfo[]>([]);
  const [issues, setIssues] = useState<FormattingIssue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [currentPlan, setCurrentPlan] = useState<FormattingPlan | null>(null);
  const [outputFile, setOutputFile] = useState<StoredFile | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'preview' | 'tools'>('preview');
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load available files for the user
  useEffect(() => {
    if (!user) return;
    const loadFiles = async () => {
      try {
        const res = await authFetch('/api/files');
        const data = await readApiJson<{ files: StoredFile[] }>(res, '/api/files');
        const docxList = (data.files || []).filter(
          f => f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
               f.originalName.toLowerCase().endsWith('.docx')
        );
        setStoredFiles(docxList);
      } catch (err) {
        console.warn('Could not load user files:', err);
      }
    };
    void loadFiles();
  }, [user]);

  // Load blob and inspect when selectedFile changes
  useEffect(() => {
    if (!user || !selectedFile) {
      setDocBlob(null);
      setParagraphs([]);
      setIssues([]);
      setCurrentPlan(null);
      setOutputFile(null);
      return;
    }

    const loadContent = async () => {
      try {
        setIsAnalyzing(true);
        setStatusMessage('Đang tải nội dung văn bản...');

        // Fetch raw binary
        const contentRes = await authFetch(`/api/files/${selectedFile.fileId}/content`);
        if (!contentRes.ok) throw new Error('Không thể tải tệp nội dung');
        const blob = await contentRes.blob();
        setDocBlob(blob);

        // Analyze against selected profile
        setStatusMessage('Đang phân tích định dạng theo ' + FORMATTING_PROFILES[selectedProfileId].name + '...');
        const analyzeRes = await authFetch('/api/documents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: selectedFile.fileId, profileId: selectedProfileId }),
        });
        const analyzeData = await readApiJson<any>(analyzeRes, '/api/documents/analyze');

        setParagraphs(analyzeData.inspection?.paragraphs || []);
        const loadedIssues: FormattingIssue[] = analyzeData.issues || [];
        setIssues(loadedIssues);
        setCurrentPlan(analyzeData.plan || null);

        // Pre-select all safe issues
        const safeIds = new Set(loadedIssues.filter(i => i.safeToAutoFix).map(i => i.id));
        setSelectedIssueIds(safeIds);
        setStatusMessage(null);
      } catch (err: any) {
        console.warn('Analysis error:', err);
        setStatusMessage('Lỗi khi phân tích tệp: ' + (err.message || 'Thao tác không thành công'));
      } finally {
        setIsAnalyzing(false);
      }
    };

    void loadContent();
  }, [user, selectedFile, selectedProfileId]);

  // Handle local file upload
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Vui lòng chọn tệp định dạng Microsoft Word (.docx)');
      return;
    }

    try {
      setIsUploading(true);
      setStatusMessage('Đang tải tệp lên máy chủ...');

      const buffer = await file.arrayBuffer();
      const res = await authFetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: buffer,
      });

      const data = await readApiJson<{ file: StoredFile }>(res, '/api/files');
      setStoredFiles(prev => [data.file, ...prev]);
      setSelectedFile(data.file);
      setStatusMessage(null);
    } catch (err: any) {
      console.warn('Upload error:', err);
      alert('Không thể tải tệp lên: ' + (err.message || 'Lỗi hệ thống'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Re-run analysis
  const handleAnalyze = async () => {
    if (!selectedFile) return;
    try {
      setIsAnalyzing(true);
      const analyzeRes = await authFetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: selectedFile.fileId, profileId: selectedProfileId }),
      });
      const analyzeData = await readApiJson<any>(analyzeRes, '/api/documents/analyze');
      setParagraphs(analyzeData.inspection?.paragraphs || []);
      const loadedIssues: FormattingIssue[] = analyzeData.issues || [];
      setIssues(loadedIssues);
      setCurrentPlan(analyzeData.plan || null);
      setSelectedIssueIds(new Set(loadedIssues.filter(i => i.safeToAutoFix).map(i => i.id)));
    } catch (err: any) {
      alert('Lỗi phân tích: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Apply Formatting Plan
  const handleApplyPlan = async () => {
    if (!selectedFile || !currentPlan) return;

    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn áp dụng ${selectedIssueIds.size} thao tác chuẩn hóa định dạng? Tệp mới sẽ được tạo và bảo toàn tệp gốc.`
    );
    if (!confirmed) return;

    try {
      setIsApplying(true);
      setStatusMessage('Đang áp dụng định dạng và kiểm tra tính toàn vẹn...');

      // Filter plan operations based on selected issues
      const res = await authFetch('/api/documents/apply-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: selectedFile.fileId,
          plan: currentPlan,
        }),
      });

      const data = await readApiJson<any>(res, '/api/documents/apply-plan');
      setOutputFile(data.outputFile);

      // Load formatted output blob
      const outBlobRes = await authFetch(`/api/files/${data.outputFile.fileId}/content`);
      if (outBlobRes.ok) {
        const outBlob = await outBlobRes.blob();
        setOutputBlob(outBlob);
        setDocBlob(outBlob); // Switch preview to formatted output!
      }

      setReportData({
        sourceFileName: selectedFile.originalName,
        outputFileName: data.outputFile.originalName,
        sourceSha256: data.changeManifest.sourceSha256,
        outputSha256: data.changeManifest.outputSha256,
        operationsCount: data.operationsApplied,
        profileName: FORMATTING_PROFILES[selectedProfileId].name,
        appliedAt: data.changeManifest.appliedAt,
      });

      setShowReport(true);
      setStatusMessage('Chuẩn hóa thành công!');
    } catch (err: any) {
      alert('Không thể áp dụng định dạng: ' + (err.message || 'Lỗi xử lý DOCX'));
    } finally {
      setIsApplying(false);
    }
  };

  // Download output
  const handleDownload = () => {
    const targetFile = outputFile || selectedFile;
    const targetBlob = outputBlob || docBlob;
    if (!targetFile || !targetBlob) return;

    const url = URL.createObjectURL(targetBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetFile.originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleIssue = (issueId: string) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const handleSelectAllSafe = () => {
    const safeIssues = issues.filter(i => i.safeToAutoFix);
    const allSelected = safeIssues.every(i => selectedIssueIds.has(i.id));
    if (allSelected) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(safeIssues.map(i => i.id)));
    }
  };

  const selectedParagraph = paragraphs.find(p => p.paragraphId === selectedParagraphId);

  return (
    <div className="flex h-full flex-col bg-neutral-100 overflow-hidden">
      {/* Top action toolbar */}
      <FormattingToolbar
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        onAnalyze={handleAnalyze}
        isAnalyzing={isAnalyzing}
        onApplyPlan={handleApplyPlan}
        isApplying={isApplying}
        canApply={Boolean(selectedFile && selectedIssueIds.size > 0)}
        hasOutput={Boolean(outputFile)}
        onDownloadOutput={handleDownload}
        selectedIssuesCount={selectedIssueIds.size}
        totalIssuesCount={issues.length}
      />

      {/* Mobile & Tablet Tab Switcher */}
      <div className="lg:hidden flex border-b border-neutral-200 bg-white">
        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`flex-1 py-2 text-center text-xs font-semibold ${
            activeTab === 'files' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-neutral-500'
          }`}
        >
          Tài liệu ({storedFiles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-2 text-center text-xs font-semibold ${
            activeTab === 'preview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-neutral-500'
          }`}
        >
          Xem trước
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`flex-1 py-2 text-center text-xs font-semibold ${
            activeTab === 'tools' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-neutral-500'
          }`}
        >
          Lỗi ({issues.length})
        </button>
      </div>

      {/* Main 3-column Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Documents & Issues (desktop or tab active) */}
        <div
          className={`w-80 shrink-0 border-r border-neutral-200 bg-white flex flex-col min-h-0 ${
            activeTab === 'files' ? 'flex w-full' : 'hidden lg:flex'
          }`}
        >
          {/* File Picker & Upload Section */}
          <div className="p-3.5 border-b border-neutral-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Tài liệu Word
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-1.5 text-xs h-7 px-2"
              >
                {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Tải lên DOCX
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleUploadFile}
                className="hidden"
              />
            </div>

            {/* List of DOCX files */}
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
              {storedFiles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-200 p-3 text-center text-neutral-400 text-xs">
                  Chưa có tài liệu DOCX nào được tải lên.
                </div>
              ) : (
                storedFiles.map(file => {
                  const isSelected = selectedFile?.fileId === file.fileId;
                  return (
                    <div
                      key={file.fileId}
                      onClick={() => setSelectedFile(file)}
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 border border-blue-200 font-semibold'
                          : 'hover:bg-neutral-50 text-neutral-700 border border-transparent'
                      }`}
                    >
                      <FileText className={`h-4 w-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-neutral-400'}`} />
                      <span className="truncate flex-1">{file.originalName}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Issues List Component */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <IssuesList
              issues={issues}
              selectedIssueId={selectedParagraphId}
              onSelectIssue={(id) => {
                const issue = issues.find(i => i.id === id);
                if (issue?.targetId) setSelectedParagraphId(issue.targetId);
              }}
              selectedIssueIds={selectedIssueIds}
              onToggleIssue={handleToggleIssue}
              onSelectAllSafe={handleSelectAllSafe}
            />
          </div>
        </div>

        {/* Center Column: Interactive Word Preview */}
        <div
          className={`flex-1 min-w-0 flex flex-col min-h-0 ${
            activeTab === 'preview' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <DocxPreview
            docBlob={docBlob}
            paragraphs={paragraphs}
            selectedParagraphId={selectedParagraphId}
            onSelectParagraph={setSelectedParagraphId}
            fileName={selectedFile?.originalName}
            hasErrors={issues.length > 0}
          />
        </div>

        {/* Right Column: Properties & Formatting Inspector */}
        <div
          className={`w-80 shrink-0 border-l border-neutral-200 bg-white flex flex-col min-h-0 overflow-y-auto ${
            activeTab === 'tools' ? 'flex w-full' : 'hidden xl:flex'
          }`}
        >
          <div className="p-4 border-b border-neutral-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              Thuộc tính & Công cụ
            </h4>
          </div>

          <div className="p-4 space-y-4 text-xs">
            {/* Selected Paragraph Properties */}
            {selectedParagraph ? (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2.5">
                <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                  <span className="rounded bg-neutral-200 px-1 py-0.2 text-[10px] font-mono">
                    {selectedParagraph.paragraphId}
                  </span>
                  Chi tiết đoạn đang chọn
                </span>
                <p className="text-neutral-600 line-clamp-3 text-[11px] leading-relaxed">
                  "{selectedParagraph.text || 'Đoạn trống'}"
                </p>

                <div className="divide-y divide-neutral-200/80 pt-1 text-[11px]">
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Căn lề trực tiếp:</span>
                    <span className="font-mono font-medium text-neutral-800">
                      {selectedParagraph.directAlignment || 'Kế thừa style'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Font chữ:</span>
                    <span className="font-mono text-neutral-800">
                      {selectedParagraph.fontName || 'Times New Roman'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Cỡ chữ:</span>
                    <span className="font-mono text-neutral-800">
                      {selectedParagraph.fontSizePt ? `${selectedParagraph.fontSizePt} pt` : '14 pt'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-200 p-3 text-center text-neutral-400 text-[11px]">
                Chọn một đoạn văn bản từ bản xem trước hoặc danh sách lỗi để xem thuộc tính chi tiết.
              </div>
            )}

            {/* Profile Information Summary */}
            <div className="rounded-lg border border-neutral-200 p-3 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Thông số quy chuẩn áp dụng
              </span>
              <p className="font-semibold text-neutral-800">
                {FORMATTING_PROFILES[selectedProfileId].name}
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                {FORMATTING_PROFILES[selectedProfileId].description}
              </p>

              <div className="mt-2 space-y-1 rounded bg-neutral-50 p-2 text-[11px] text-neutral-700">
                <div className="flex justify-between">
                  <span>Khổ giấy:</span>
                  <span className="font-mono">A4 (210 × 297 mm)</span>
                </div>
                <div className="flex justify-between">
                  <span>Lề trên / dưới:</span>
                  <span className="font-mono">20 - 25 mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Lề trái / phải:</span>
                  <span className="font-mono">30 - 35 mm / 15 - 20 mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Font nội dung:</span>
                  <span className="font-mono">Times New Roman 13-14pt</span>
                </div>
                <div className="flex justify-between">
                  <span>Căn lề chuẩn:</span>
                  <span className="font-mono">Căn đều hai lề (Justify)</span>
                </div>
              </div>
            </div>

            {/* Formatting Plan Summary */}
            {currentPlan && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-800">
                  Kế hoạch định dạng ({currentPlan.operations.length} thao tác)
                </span>
                <ul className="space-y-1 text-[11px] text-blue-900">
                  {currentPlan.operations.slice(0, 4).map(op => (
                    <li key={op.operationId} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-600 mt-0.5" />
                      <span className="truncate">{op.description}</span>
                    </li>
                  ))}
                  {currentPlan.operations.length > 4 && (
                    <li className="text-[10px] text-blue-600 italic">
                      + {currentPlan.operations.length - 4} thao tác khác...
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison & Verification Modal */}
      <DiffReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        report={reportData}
        onDownload={handleDownload}
      />
    </div>
  );
}
