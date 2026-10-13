import React from 'react';
import {
  Play,
  CheckCheck,
  Download,
  FileCheck2,
  SlidersHorizontal,
  Loader2,
  FileSearch,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import {
  FORMATTING_PROFILES,
  ProfileId,
} from '../../../../shared/contracts/formattingProfiles';

interface FormattingToolbarProps {
  selectedProfileId: ProfileId;
  onSelectProfile: (id: ProfileId) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  onApplyPlan: () => void;
  isApplying: boolean;
  canApply: boolean;
  hasOutput: boolean;
  onDownloadOutput: () => void;
  selectedIssuesCount: number;
  totalIssuesCount: number;
}

export function FormattingToolbar({
  selectedProfileId,
  onSelectProfile,
  onAnalyze,
  isAnalyzing,
  onApplyPlan,
  isApplying,
  canApply,
  hasOutput,
  onDownloadOutput,
  selectedIssuesCount,
  totalIssuesCount,
}: FormattingToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3 shadow-2xs">
      {/* Left: Profile selector */}
      <div className="flex items-center gap-2.5">
        <SlidersHorizontal className="h-4 w-4 text-neutral-500 shrink-0" />
        <span className="text-xs font-semibold text-neutral-700 whitespace-nowrap">Bộ quy tắc:</span>
        <select
          value={selectedProfileId}
          onChange={(e) => onSelectProfile(e.target.value as ProfileId)}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
        >
          {Object.values(FORMATTING_PROFILES).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="gap-1.5 text-xs font-medium text-neutral-700 border-neutral-200 hover:bg-neutral-50"
        >
          {isAnalyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />
          ) : (
            <FileSearch className="h-3.5 w-3.5 text-blue-600" />
          )}
          {isAnalyzing ? 'Đang phân tích...' : 'Phân tích văn bản'}
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={onApplyPlan}
          disabled={!canApply || isApplying}
          className="gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
        >
          {isApplying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" />
          )}
          {isApplying
            ? 'Đang chuẩn hóa...'
            : `Áp dụng định dạng (${selectedIssuesCount})`}
        </Button>

        {hasOutput && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onDownloadOutput}
            className="gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Tải DOCX chuẩn hóa
          </Button>
        )}
      </div>
    </div>
  );
}
