import React from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Wrench, ShieldCheck } from 'lucide-react';
import { FormattingIssue } from '../../../../shared/contracts/formattingProfiles';

interface IssuesListProps {
  issues: FormattingIssue[];
  selectedIssueId?: string | null;
  onSelectIssue?: (issueId: string) => void;
  selectedIssueIds: Set<string>;
  onToggleIssue: (issueId: string) => void;
  onSelectAllSafe: () => void;
}

export function IssuesList({
  issues,
  selectedIssueId,
  onSelectIssue,
  selectedIssueIds,
  onToggleIssue,
  onSelectAllSafe,
}: IssuesListProps) {
  const safeIssues = issues.filter(i => i.safeToAutoFix);
  const allSafeSelected = safeIssues.length > 0 && safeIssues.every(i => selectedIssueIds.has(i.id));

  const getSeverityBadge = (severity: FormattingIssue['severity']) => {
    switch (severity) {
      case 'high':
        return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Mức cao</span>;
      case 'medium':
        return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Cần sửa</span>;
      case 'low':
      default:
        return <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">Khuyến nghị</span>;
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header with Batch Selector */}
      <div className="border-b border-neutral-200 p-3.5 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-800">
            Điểm cần chuẩn hóa ({issues.length})
          </h4>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Đã chọn {selectedIssueIds.size} / {issues.length} mục để áp dụng
          </p>
        </div>

        {safeIssues.length > 0 && (
          <button
            type="button"
            onClick={onSelectAllSafe}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            {allSafeSelected ? 'Bỏ chọn' : 'Chọn tất cả lỗi an toàn'}
          </button>
        )}
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {issues.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center p-4 text-neutral-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-1.5" />
            <p className="text-xs font-medium text-neutral-700">Văn bản đạt chuẩn</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Không phát hiện điểm sai lệch nào so với bộ quy tắc đã chọn.
            </p>
          </div>
        ) : (
          issues.map((issue) => {
            const isSelected = selectedIssueId === issue.id;
            const isChecked = selectedIssueIds.has(issue.id);

            return (
              <div
                key={issue.id}
                onClick={() => onSelectIssue?.(issue.id)}
                className={`group flex items-start gap-2.5 rounded-lg border p-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/40 shadow-xs'
                    : 'border-neutral-200/80 bg-white hover:border-neutral-300 hover:bg-neutral-50/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleIssue(issue.id);
                  }}
                  className="mt-1 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {getSeverityBadge(issue.severity)}
                    <span className="font-semibold text-xs text-neutral-800 truncate">
                      {issue.targetLabel}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 leading-snug">
                    {issue.description}
                  </p>

                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 font-mono">
                      Hiện tại: {issue.currentValue}
                    </span>
                    <ChevronRight className="h-3 w-3 text-neutral-400 shrink-0" />
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-mono font-medium">
                      Quy chuẩn: {issue.expectedValue}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
