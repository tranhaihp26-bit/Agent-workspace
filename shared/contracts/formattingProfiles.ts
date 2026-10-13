import { z } from 'zod';

export const ProcessorAlignmentSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']);
export type ProcessorAlignment = z.infer<typeof ProcessorAlignmentSchema>;

export interface DocxParagraphInfo {
  paragraphId: string;
  text: string;
  directAlignment: ProcessorAlignment | null;
  styleId?: string;
  isHeading?: boolean;
  headingLevel?: number;
  lineSpacing?: number; // in dxa or multiple
  spaceBefore?: number; // in dxa
  spaceAfter?: number; // in dxa
  firstLineIndent?: number; // in dxa
  fontName?: string;
  fontSizePt?: number;
}

export interface DocxSectionInfo {
  pageWidthMm: number;
  pageHeightMm: number;
  orientation: 'portrait' | 'landscape';
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

export interface DocxInspectionData {
  sourceSha256: string;
  paragraphs: DocxParagraphInfo[];
  section: DocxSectionInfo;
  safeToMutate: boolean;
  packagePolicy: 'NORMAL' | 'GUARDED' | 'AUDIT_ONLY' | 'PROHIBITED';
  totalParagraphs: number;
  hasTables: boolean;
  hasImages: boolean;
  hasHeaders: boolean;
  hasFooters: boolean;
}

export const ProfileIdSchema = z.enum([
  'nghi-dinh-30',
  'academic-thesis',
  'standard-report',
  'custom',
]);

export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const PageSetupRuleSchema = z.object({
  paperSize: z.literal('A4'),
  pageWidthMm: z.number().default(210),
  pageHeightMm: z.number().default(297),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  marginTopMinMm: z.number().default(20),
  marginTopMaxMm: z.number().default(25),
  marginTopTargetMm: z.number().default(20),
  marginBottomMinMm: z.number().default(20),
  marginBottomMaxMm: z.number().default(25),
  marginBottomTargetMm: z.number().default(20),
  marginLeftMinMm: z.number().default(30),
  marginLeftMaxMm: z.number().default(35),
  marginLeftTargetMm: z.number().default(30),
  marginRightMinMm: z.number().default(15),
  marginRightMaxMm: z.number().default(20),
  marginRightTargetMm: z.number().default(15),
}).strict();

export const TypographyRuleSchema = z.object({
  fontFamily: z.string().default('Times New Roman'),
  bodyFontSizeMinPt: z.number().default(13),
  bodyFontSizeMaxPt: z.number().default(14),
  bodyFontSizeTargetPt: z.number().default(14),
  heading1SizePt: z.number().default(14),
  heading2SizePt: z.number().default(13),
  heading3SizePt: z.number().default(13),
}).strict();

export const ParagraphRuleSchema = z.object({
  bodyAlignment: ProcessorAlignmentSchema.default('JUSTIFY'),
  lineSpacingMultiple: z.number().default(1.25), // 1.25 to 1.5
  spaceBeforePt: z.number().default(6),
  spaceAfterPt: z.number().default(6),
  firstLineIndentMm: z.number().default(12.7), // 1.27 cm = 0.5 inch
}).strict();

export const FormattingProfileSchema = z.object({
  id: ProfileIdSchema,
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  standardSource: z.string(),
  pageSetup: PageSetupRuleSchema,
  typography: TypographyRuleSchema,
  paragraph: ParagraphRuleSchema,
}).strict();

export type FormattingProfile = z.infer<typeof FormattingProfileSchema>;

export const FORMATTING_PROFILES: Record<ProfileId, FormattingProfile> = {
  'nghi-dinh-30': {
    id: 'nghi-dinh-30',
    name: 'Văn bản hành chính (Nghị định 30/2020/NĐ-CP)',
    description: 'Quy chuẩn thể thức văn bản hành chính Việt Nam theo Nghị định 30/2020/NĐ-CP. Khổ A4, lề chuẩn (trên/dưới 20-25mm, trái 30-35mm, phải 15-20mm), font Times New Roman cỡ 13-14pt, căn đều hai lề.',
    version: '1.0.0',
    standardSource: 'Nghị định số 30/2020/NĐ-CP ngày 05/03/2020 của Chính phủ về công tác văn thư',
    pageSetup: {
      paperSize: 'A4',
      pageWidthMm: 210,
      pageHeightMm: 297,
      orientation: 'portrait',
      marginTopMinMm: 20,
      marginTopMaxMm: 25,
      marginTopTargetMm: 20,
      marginBottomMinMm: 20,
      marginBottomMaxMm: 25,
      marginBottomTargetMm: 20,
      marginLeftMinMm: 30,
      marginLeftMaxMm: 35,
      marginLeftTargetMm: 30,
      marginRightMinMm: 15,
      marginRightMaxMm: 20,
      marginRightTargetMm: 15,
    },
    typography: {
      fontFamily: 'Times New Roman',
      bodyFontSizeMinPt: 13,
      bodyFontSizeMaxPt: 14,
      bodyFontSizeTargetPt: 14,
      heading1SizePt: 14,
      heading2SizePt: 13,
      heading3SizePt: 13,
    },
    paragraph: {
      bodyAlignment: 'JUSTIFY',
      lineSpacingMultiple: 1.25,
      spaceBeforePt: 6,
      spaceAfterPt: 6,
      firstLineIndentMm: 12.7,
    },
  },
  'academic-thesis': {
    id: 'academic-thesis',
    name: 'Tài liệu học thuật & Luận văn',
    description: 'Quy chuẩn báo cáo khoa học, luận văn, luận án thạc sĩ/tiến sĩ. Khổ A4, lề trái 35mm để đóng gáy, font Times New Roman 13pt, giãn dòng 1.5 lines, thụt đầu dòng 1.27cm.',
    version: '1.0.0',
    standardSource: 'Quy chế đào tạo & hướng dẫn trình bày luận văn, luận án học thuật chuẩn',
    pageSetup: {
      paperSize: 'A4',
      pageWidthMm: 210,
      pageHeightMm: 297,
      orientation: 'portrait',
      marginTopMinMm: 25,
      marginTopMaxMm: 30,
      marginTopTargetMm: 25,
      marginBottomMinMm: 25,
      marginBottomMaxMm: 30,
      marginBottomTargetMm: 25,
      marginLeftMinMm: 35,
      marginLeftMaxMm: 40,
      marginLeftTargetMm: 35,
      marginRightMinMm: 20,
      marginRightMaxMm: 25,
      marginRightTargetMm: 20,
    },
    typography: {
      fontFamily: 'Times New Roman',
      bodyFontSizeMinPt: 13,
      bodyFontSizeMaxPt: 13,
      bodyFontSizeTargetPt: 13,
      heading1SizePt: 16,
      heading2SizePt: 14,
      heading3SizePt: 13,
    },
    paragraph: {
      bodyAlignment: 'JUSTIFY',
      lineSpacingMultiple: 1.5,
      spaceBeforePt: 6,
      spaceAfterPt: 6,
      firstLineIndentMm: 12.7,
    },
  },
  'standard-report': {
    id: 'standard-report',
    name: 'Báo cáo doanh nghiệp chuẩn',
    description: 'Định dạng báo cáo, đề xuất chuyên nghiệp hiện đại. Khổ A4, font Arial hoặc Times New Roman, lề đều 20mm, giãn dòng 1.15 lines.',
    version: '1.0.0',
    standardSource: 'Standard Business Report Guidelines',
    pageSetup: {
      paperSize: 'A4',
      pageWidthMm: 210,
      pageHeightMm: 297,
      orientation: 'portrait',
      marginTopMinMm: 20,
      marginTopMaxMm: 25,
      marginTopTargetMm: 20,
      marginBottomMinMm: 20,
      marginBottomMaxMm: 25,
      marginBottomTargetMm: 20,
      marginLeftMinMm: 20,
      marginLeftMaxMm: 25,
      marginLeftTargetMm: 20,
      marginRightMinMm: 20,
      marginRightMaxMm: 25,
      marginRightTargetMm: 20,
    },
    typography: {
      fontFamily: 'Times New Roman',
      bodyFontSizeMinPt: 12,
      bodyFontSizeMaxPt: 13,
      bodyFontSizeTargetPt: 12,
      heading1SizePt: 16,
      heading2SizePt: 14,
      heading3SizePt: 12,
    },
    paragraph: {
      bodyAlignment: 'JUSTIFY',
      lineSpacingMultiple: 1.15,
      spaceBeforePt: 4,
      spaceAfterPt: 4,
      firstLineIndentMm: 0,
    },
  },
  'custom': {
    id: 'custom',
    name: 'Tùy chỉnh thông số cá nhân',
    description: 'Bộ thông số linh hoạt theo yêu cầu cụ thể của người dùng.',
    version: '1.0.0',
    standardSource: 'User Custom Preset',
    pageSetup: {
      paperSize: 'A4',
      pageWidthMm: 210,
      pageHeightMm: 297,
      orientation: 'portrait',
      marginTopMinMm: 20,
      marginTopMaxMm: 25,
      marginTopTargetMm: 20,
      marginBottomMinMm: 20,
      marginBottomMaxMm: 25,
      marginBottomTargetMm: 20,
      marginLeftMinMm: 30,
      marginLeftMaxMm: 35,
      marginLeftTargetMm: 30,
      marginRightMinMm: 15,
      marginRightMaxMm: 20,
      marginRightTargetMm: 15,
    },
    typography: {
      fontFamily: 'Times New Roman',
      bodyFontSizeMinPt: 13,
      bodyFontSizeMaxPt: 14,
      bodyFontSizeTargetPt: 14,
      heading1SizePt: 14,
      heading2SizePt: 13,
      heading3SizePt: 13,
    },
    paragraph: {
      bodyAlignment: 'JUSTIFY',
      lineSpacingMultiple: 1.25,
      spaceBeforePt: 6,
      spaceAfterPt: 6,
      firstLineIndentMm: 12.7,
    },
  },
};

export interface FormattingIssue {
  id: string; // Deterministic issue ID e.g. "issue-p3-align"
  category: 'page_setup' | 'alignment' | 'typography' | 'spacing';
  targetId: string; // e.g. "section-1" or "p3"
  targetLabel: string; // e.g. "Đoạn 3" or "Thiết lập trang"
  description: string;
  currentValue: string;
  expectedValue: string;
  severity: 'high' | 'medium' | 'low';
  safeToAutoFix: boolean;
  proposedAction: 'set_margins' | 'set_alignment' | 'standardize_font' | 'set_spacing';
}

export interface FormattingPlanOperation {
  operationId: string;
  type: 'page_setup' | 'paragraph_alignment' | 'standardize_fonts' | 'standardize_spacing';
  targetId?: string;
  params: Record<string, any>;
  description: string;
}

export interface FormattingPlan {
  planId: string;
  sourceFileId: string;
  sourceSha256: string;
  profileId: ProfileId;
  totalIssuesCount: number;
  operations: FormattingPlanOperation[];
  createdAt: string;
}
