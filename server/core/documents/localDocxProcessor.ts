import { createHash, randomUUID } from 'crypto';
import {
  DocumentInspectionResult,
  DocumentInspectionSchema,
  DocumentProcessorError,
  ProcessorAlignment,
} from './documentProcessorClient';
import { DocxOxmlEngine } from './docxOxmlEngine';
import {
  FormattingIssue,
  FormattingPlan,
  FORMATTING_PROFILES,
  ProfileId,
} from '../../../shared/contracts/formattingProfiles';

export class LocalDocxProcessor {
  /**
   * Conforms to DocumentProcessorClient.inspect interface.
   */
  public async inspect(bytes: Buffer, _signal?: AbortSignal): Promise<DocumentInspectionResult> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new DocumentProcessorError('INVALID_INPUT', 'The DOCX input is invalid or empty.');
    }

    try {
      const data = await DocxOxmlEngine.inspect(bytes);

      const inspection: DocumentInspectionResult = {
        sourceSha256: data.sourceSha256,
        profile: 'generic-direct-alignment-spike',
        safeToMutate: data.safeToMutate,
        packagePolicy: data.packagePolicy,
        paragraphs: data.paragraphs.map(p => ({
          paragraphId: p.paragraphId,
          text: p.text,
          directAlignment: p.directAlignment,
          issueId: null,
        })),
        paragraphsTruncated: data.totalParagraphs > 250,
        diagnostics: [],
      };

      // Validate schema conformance strictly
      const parsed = DocumentInspectionSchema.safeParse(inspection);
      if (!parsed.success) {
        throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'Inspection output failed contract validation.');
      }
      return parsed.data;
    } catch (error: any) {
      if (error instanceof DocumentProcessorError) throw error;
      throw new DocumentProcessorError('MALFORMED_DOCX', error?.message || 'Could not inspect DOCX archive.');
    }
  }

  /**
   * Conforms to DocumentProcessorClient.applyAlignment interface.
   */
  public async applyAlignment(
    input: {
      bytes: Buffer;
      sourceSha256: string;
      paragraphId: string;
      expectedBefore: ProcessorAlignment;
      desiredAfter: ProcessorAlignment;
    },
    _signal?: AbortSignal
  ): Promise<{ bytes: Buffer; sha256: string }> {
    const actualSha = createHash('sha256').update(input.bytes).digest('hex');
    if (actualSha.toLowerCase() !== input.sourceSha256.toLowerCase()) {
      throw new DocumentProcessorError('STALE_DOCUMENT', 'The source DOCX changed after inspection.');
    }

    try {
      const result = await DocxOxmlEngine.applyAlignment(input.bytes, input.paragraphId, input.desiredAfter);
      return result;
    } catch (error: any) {
      if (error instanceof DocumentProcessorError) throw error;
      throw new DocumentProcessorError('PROCESSING_FAILED', error?.message || 'Failed to apply alignment.');
    }
  }

  /**
   * Advanced analysis: Compares document against a chosen FormattingProfile.
   */
  public async analyzeFormatting(
    bytes: Buffer,
    sourceFileId: string,
    profileId: ProfileId = 'nghi-dinh-30'
  ): Promise<{
    inspection: DocumentInspectionResult;
    issues: FormattingIssue[];
    plan: FormattingPlan;
  }> {
    const inspectionData = await DocxOxmlEngine.inspect(bytes);
    const profile = FORMATTING_PROFILES[profileId] || FORMATTING_PROFILES['nghi-dinh-30'];
    const issues: FormattingIssue[] = [];

    // 1. Inspect page margins & setup against profile
    const { section } = inspectionData;
    const { pageSetup, typography, paragraph: pRules } = profile;

    if (
      section.marginTopMm < pageSetup.marginTopMinMm ||
      section.marginTopMm > pageSetup.marginTopMaxMm ||
      section.marginBottomMm < pageSetup.marginBottomMinMm ||
      section.marginBottomMm > pageSetup.marginBottomMaxMm ||
      section.marginLeftMm < pageSetup.marginLeftMinMm ||
      section.marginLeftMm > pageSetup.marginLeftMaxMm ||
      section.marginRightMm < pageSetup.marginRightMinMm ||
      section.marginRightMm > pageSetup.marginRightMaxMm
    ) {
      issues.push({
        id: 'issue-page-margins',
        category: 'page_setup',
        targetId: 'section-1',
        targetLabel: 'Căn lề trang (Page Margins)',
        description: `Lề hiện tại (${section.marginTopMm}/${section.marginBottomMm}/${section.marginLeftMm}/${section.marginRightMm} mm) chưa đúng chuẩn Nghị định 30 (Trên/Dưới: 20-25mm, Trái: 30-35mm, Phải: 15-20mm).`,
        currentValue: `T:${section.marginTopMm} B:${section.marginBottomMm} L:${section.marginLeftMm} R:${section.marginRightMm} mm`,
        expectedValue: `T:${pageSetup.marginTopTargetMm} B:${pageSetup.marginBottomTargetMm} L:${pageSetup.marginLeftTargetMm} R:${pageSetup.marginRightTargetMm} mm`,
        severity: 'high',
        safeToAutoFix: true,
        proposedAction: 'set_margins',
      });
    }

    // 2. Inspect paragraphs alignment & formatting
    const targetAlign = pRules.bodyAlignment;
    for (const p of inspectionData.paragraphs) {
      // If it has text and is not a heading
      if (p.text.trim().length > 30 && !p.isHeading) {
        if (p.directAlignment !== targetAlign && p.directAlignment !== null) {
          issues.push({
            id: `issue-${p.paragraphId}-align`,
            category: 'alignment',
            targetId: p.paragraphId,
            targetLabel: `Đoạn ${p.paragraphId} ("${p.text.slice(0, 35)}...")`,
            description: `Đoạn văn bản đang căn ${p.directAlignment || 'mặc định'}, quy chuẩn yêu cầu căn đều hai lề (${targetAlign}).`,
            currentValue: p.directAlignment || 'Mặc định',
            expectedValue: targetAlign,
            severity: 'medium',
            safeToAutoFix: true,
            proposedAction: 'set_alignment',
          });
        }
      }

      // Check font family if detected
      if (p.fontName && !p.fontName.toLowerCase().includes('times new roman')) {
        issues.push({
          id: `issue-${p.paragraphId}-font`,
          category: 'typography',
          targetId: p.paragraphId,
          targetLabel: `Font chữ đoạn ${p.paragraphId}`,
          description: `Font "${p.fontName}" không khớp chuẩn ${typography.fontFamily}.`,
          currentValue: p.fontName,
          expectedValue: typography.fontFamily,
          severity: 'medium',
          safeToAutoFix: true,
          proposedAction: 'standardize_font',
        });
      }
    }

    // Generate automatic operations for safe issues
    const operations: FormattingPlan['operations'] = [];

    // Page margins operation
    const marginIssue = issues.find(i => i.id === 'issue-page-margins');
    if (marginIssue) {
      operations.push({
        operationId: `op-margins-${randomUUID().slice(0, 8)}`,
        type: 'page_setup',
        targetId: 'section-1',
        params: {
          marginTopMm: pageSetup.marginTopTargetMm,
          marginBottomMm: pageSetup.marginBottomTargetMm,
          marginLeftMm: pageSetup.marginLeftTargetMm,
          marginRightMm: pageSetup.marginRightTargetMm,
          pageWidthMm: pageSetup.pageWidthMm,
          pageHeightMm: pageSetup.pageHeightMm,
          orientation: pageSetup.orientation,
        },
        description: `Chuẩn hóa lề trang: Trên ${pageSetup.marginTopTargetMm}mm, Dưới ${pageSetup.marginBottomTargetMm}mm, Trái ${pageSetup.marginLeftTargetMm}mm, Phải ${pageSetup.marginRightTargetMm}mm.`,
      });
    }

    // Font standardizing operation
    operations.push({
      operationId: `op-font-${randomUUID().slice(0, 8)}`,
      type: 'standardize_fonts',
      params: {
        fontFamily: typography.fontFamily,
        bodyFontSizePt: typography.bodyFontSizeTargetPt,
      },
      description: `Đồng bộ font chữ toàn văn bản sang ${typography.fontFamily}, cỡ chữ nội dung ${typography.bodyFontSizeTargetPt}pt.`,
    });

    // Spacing operation
    operations.push({
      operationId: `op-spacing-${randomUUID().slice(0, 8)}`,
      type: 'standardize_spacing',
      params: {
        lineSpacingMultiple: pRules.lineSpacingMultiple,
        spaceBeforePt: pRules.spaceBeforePt,
        spaceAfterPt: pRules.spaceAfterPt,
        firstLineIndentMm: pRules.firstLineIndentMm,
      },
      description: `Chuẩn hóa giãn dòng ${pRules.lineSpacingMultiple} lines, giãn đoạn ${pRules.spaceBeforePt}pt trước / ${pRules.spaceAfterPt}pt sau, thụt đầu dòng 1.27cm.`,
    });

    // Paragraph alignment operations
    for (const issue of issues.filter(i => i.category === 'alignment')) {
      operations.push({
        operationId: `op-align-${issue.targetId}-${randomUUID().slice(0, 8)}`,
        type: 'paragraph_alignment',
        targetId: issue.targetId,
        params: {
          paragraphId: issue.targetId,
          desiredAfter: targetAlign,
        },
        description: `Căn đều hai lề cho đoạn ${issue.targetId}.`,
      });
    }

    const plan: FormattingPlan = {
      planId: `plan-${Date.now()}-${randomUUID().slice(0, 8)}`,
      sourceFileId,
      sourceSha256: inspectionData.sourceSha256,
      profileId,
      totalIssuesCount: issues.length,
      operations,
      createdAt: new Date().toISOString(),
    };

    const inspection = await this.inspect(bytes);

    return {
      inspection,
      issues,
      plan,
    };
  }

  /**
   * Applies all operations from a FormattingPlan sequentially on DOCX buffer.
   */
  public async applyFormattingPlan(
    bytes: Buffer,
    plan: FormattingPlan
  ): Promise<{
    bytes: Buffer;
    sha256: string;
    operationsApplied: number;
    verification: {
      reopened: true;
      revalidated: true;
      sourceUnchanged: true;
      outputInspectionPassed: true;
    };
  }> {
    const actualSourceSha = createHash('sha256').update(bytes).digest('hex');
    if (actualSourceSha.toLowerCase() !== plan.sourceSha256.toLowerCase()) {
      throw new DocumentProcessorError('STALE_DOCUMENT', 'The source DOCX changed after plan generation.');
    }

    let currentBytes = Buffer.from(bytes);
    let appliedCount = 0;

    for (const op of plan.operations) {
      if (op.type === 'page_setup') {
        const res = await DocxOxmlEngine.applyPageSetup(currentBytes, op.params);
        currentBytes = res.bytes;
        appliedCount++;
      } else if (op.type === 'paragraph_alignment' && op.params.paragraphId && op.params.desiredAfter) {
        const res = await DocxOxmlEngine.applyAlignment(
          currentBytes,
          op.params.paragraphId,
          op.params.desiredAfter
        );
        currentBytes = res.bytes;
        appliedCount++;
      } else if (op.type === 'standardize_fonts') {
        const res = await DocxOxmlEngine.standardizeFonts(currentBytes, op.params);
        currentBytes = res.bytes;
        appliedCount++;
      } else if (op.type === 'standardize_spacing') {
        const res = await DocxOxmlEngine.standardizeSpacing(currentBytes, op.params);
        currentBytes = res.bytes;
        appliedCount++;
      }
    }

    const outputSha = createHash('sha256').update(currentBytes).digest('hex');

    // Reopen & verify output integrity
    const outputInspection = await this.inspect(currentBytes);
    if (!outputInspection.safeToMutate || outputInspection.packagePolicy !== 'NORMAL') {
      throw new DocumentProcessorError('OUTPUT_INTEGRITY_FAILED', 'Output DOCX failed revalidation inspection.');
    }

    return {
      bytes: currentBytes,
      sha256: outputSha,
      operationsApplied: appliedCount,
      verification: {
        reopened: true,
        revalidated: true,
        sourceUnchanged: true,
        outputInspectionPassed: true,
      },
    };
  }
}
