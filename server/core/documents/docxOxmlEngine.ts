import JSZip from 'jszip';
import { createHash } from 'crypto';
import {
  type ProcessorAlignment,
  type DocxParagraphInfo,
  type DocxSectionInfo,
  type DocxInspectionData,
} from '../../../shared/contracts/formattingProfiles';

export type { DocxParagraphInfo, DocxSectionInfo, DocxInspectionData };

const DXA_PER_MM = 56.692913; // 1 mm = 56.692913 dxa (20 dxa = 1 pt = 1/72 inch)

export class DocxOxmlEngine {
  /**
   * Safely loads and inspects a DOCX buffer.
   */
  public static async inspect(buffer: Buffer): Promise<DocxInspectionData> {
    const sha = createHash('sha256').update(buffer).digest('hex');
    const zip = await this.loadZipSafely(buffer);

    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('MALFORMED_DOCX: Missing word/document.xml in DOCX package.');
    }
    const docXml = await docXmlFile.async('text');

    const hasTables = /<w:tbl[\s>]/i.test(docXml);
    const hasImages = /<w:drawing[\s>]|<v:shape[\s>]|<a:blip[\s>]/i.test(docXml);
    const hasHeaders = Object.keys(zip.files).some(name => /^word\/header\d+\.xml$/i.test(name));
    const hasFooters = Object.keys(zip.files).some(name => /^word\/footer\d+\.xml$/i.test(name));

    // Check for risky package parts (macros, external suspicious relationships)
    const isMacro = Object.keys(zip.files).some(name => /vbaProject\.bin/i.test(name));
    const packagePolicy = isMacro ? 'PROHIBITED' : 'NORMAL';

    const paragraphs = this.extractParagraphs(docXml);
    const section = this.extractSectionProperties(docXml);

    return {
      sourceSha256: sha,
      paragraphs,
      section,
      safeToMutate: packagePolicy === 'NORMAL',
      packagePolicy,
      totalParagraphs: paragraphs.length,
      hasTables,
      hasImages,
      hasHeaders,
      hasFooters,
    };
  }

  /**
   * Modifies alignment of a specific paragraph.
   */
  public static async applyAlignment(
    buffer: Buffer,
    paragraphId: string,
    desiredAfter: ProcessorAlignment
  ): Promise<{ bytes: Buffer; sha256: string }> {
    const zip = await this.loadZipSafely(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('MALFORMED_DOCX: Missing word/document.xml');

    let docXml = await docXmlFile.async('text');
    const modifiedXml = this.setParagraphAlignment(docXml, paragraphId, desiredAfter);

    zip.file('word/document.xml', modifiedXml);
    const newBytes = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const sha = createHash('sha256').update(newBytes).digest('hex');
    return { bytes: newBytes, sha256: sha };
  }

  /**
   * Applies page setup (margins, paper size) and section properties.
   */
  public static async applyPageSetup(
    buffer: Buffer,
    options: {
      marginTopMm?: number;
      marginBottomMm?: number;
      marginLeftMm?: number;
      marginRightMm?: number;
      pageWidthMm?: number;
      pageHeightMm?: number;
      orientation?: 'portrait' | 'landscape';
    }
  ): Promise<{ bytes: Buffer; sha256: string }> {
    const zip = await this.loadZipSafely(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('MALFORMED_DOCX: Missing word/document.xml');

    let docXml = await docXmlFile.async('text');
    docXml = this.modifySectionProperties(docXml, options);

    zip.file('word/document.xml', docXml);
    const newBytes = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const sha = createHash('sha256').update(newBytes).digest('hex');
    return { bytes: newBytes, sha256: sha };
  }

  /**
   * Standardizes font family and font size across paragraph runs.
   */
  public static async standardizeFonts(
    buffer: Buffer,
    options: {
      fontFamily?: string;
      bodyFontSizePt?: number;
      paragraphIds?: string[];
    }
  ): Promise<{ bytes: Buffer; sha256: string }> {
    const zip = await this.loadZipSafely(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('MALFORMED_DOCX: Missing word/document.xml');

    let docXml = await docXmlFile.async('text');
    docXml = this.modifyFontsInXml(docXml, options);

    zip.file('word/document.xml', docXml);
    const newBytes = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const sha = createHash('sha256').update(newBytes).digest('hex');
    return { bytes: newBytes, sha256: sha };
  }

  /**
   * Standardizes paragraph line spacing and indentation.
   */
  public static async standardizeSpacing(
    buffer: Buffer,
    options: {
      lineSpacingMultiple?: number; // e.g. 1.2 or 1.5
      spaceBeforePt?: number;
      spaceAfterPt?: number;
      firstLineIndentMm?: number;
      paragraphIds?: string[];
    }
  ): Promise<{ bytes: Buffer; sha256: string }> {
    const zip = await this.loadZipSafely(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('MALFORMED_DOCX: Missing word/document.xml');

    let docXml = await docXmlFile.async('text');
    docXml = this.modifySpacingInXml(docXml, options);

    zip.file('word/document.xml', docXml);
    const newBytes = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const sha = createHash('sha256').update(newBytes).digest('hex');
    return { bytes: newBytes, sha256: sha };
  }

  // --- Internal XML Parsing & Mutation Helpers ---

  private static async loadZipSafely(buffer: Buffer): Promise<JSZip> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    // Validate archive safety (zip traversal, excessive entry counts)
    const files = Object.keys(zip.files);
    if (files.length > 500) {
      throw new Error('ARCHIVE_ENTRY_LIMIT: DOCX contains too many entries.');
    }
    for (const name of files) {
      if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
        throw new Error(`UNSAFE_ARCHIVE_PATH: Unsafe zip entry path: ${name}`);
      }
    }
    return zip;
  }

  private static extractParagraphs(docXml: string): DocxParagraphInfo[] {
    const paragraphs: DocxParagraphInfo[] = [];
    const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
    let match: RegExpExecArray | null;
    let index = 1;

    while ((match = pRegex.exec(docXml)) !== null) {
      const pInner = match[1];
      const pId = `p${index++}`;

      // Extract raw text
      const textMatches = pInner.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi) || [];
      const text = textMatches
        .map(t => t.replace(/<w:t(?:\s[^>]*)?>/i, '').replace(/<\/w:t>/i, ''))
        .join('');

      // Extract alignment from <w:pPr> -> <w:jc w:val="..."/>
      let directAlignment: ProcessorAlignment | null = null;
      const jcMatch = pInner.match(/<w:jc\s+[^>]*w:val="([^"]+)"/i);
      if (jcMatch) {
        const val = jcMatch[1].toLowerCase();
        if (val === 'center') directAlignment = 'CENTER';
        else if (val === 'right') directAlignment = 'RIGHT';
        else if (val === 'both' || val === 'justify') directAlignment = 'JUSTIFY';
        else if (val === 'left') directAlignment = 'LEFT';
      }

      // Extract style (e.g. Heading1, Normal)
      const styleMatch = pInner.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i);
      const styleId = styleMatch ? styleMatch[1] : undefined;
      const isHeading = styleId ? /heading|tieude/i.test(styleId) : false;
      const headingLevel = styleId && /heading(\d)/i.test(styleId) ? parseInt(RegExp.$1, 10) : undefined;

      // Extract spacing and indentation
      const spacingMatch = pInner.match(/<w:spacing\s+([^>]+)\/>/i);
      let spaceBefore: number | undefined;
      let spaceAfter: number | undefined;
      let lineSpacing: number | undefined;
      if (spacingMatch) {
        const attrs = spacingMatch[1];
        const beforeM = attrs.match(/w:before="(\d+)"/i);
        if (beforeM) spaceBefore = parseInt(beforeM[1], 10);
        const afterM = attrs.match(/w:after="(\d+)"/i);
        if (afterM) spaceAfter = parseInt(afterM[1], 10);
        const lineM = attrs.match(/w:line="(\d+)"/i);
        if (lineM) lineSpacing = parseInt(lineM[1], 10);
      }

      const indMatch = pInner.match(/<w:ind\s+([^>]+)\/>/i);
      let firstLineIndent: number | undefined;
      if (indMatch) {
        const flM = indMatch[1].match(/w:firstLine="(\d+)"/i);
        if (flM) firstLineIndent = parseInt(flM[1], 10);
      }

      // Extract font name and size from first run
      const rFontsMatch = pInner.match(/<w:rFonts\s+[^>]*w:ascii="([^"]+)"/i);
      const fontName = rFontsMatch ? rFontsMatch[1] : undefined;

      const szMatch = pInner.match(/<w:sz\s+[^>]*w:val="(\d+)"/i);
      const fontSizePt = szMatch ? parseInt(szMatch[1], 10) / 2 : undefined;

      paragraphs.push({
        paragraphId: pId,
        text: text.slice(0, 500),
        directAlignment,
        styleId,
        isHeading,
        headingLevel,
        spaceBefore,
        spaceAfter,
        lineSpacing,
        firstLineIndent,
        fontName,
        fontSizePt,
      });

      if (paragraphs.length >= 250) break; // Keep bounded per DocumentInspectionSchema
    }

    return paragraphs;
  }

  private static extractSectionProperties(docXml: string): DocxSectionInfo {
    // Default A4 portrait
    let pageWidthMm = 210;
    let pageHeightMm = 297;
    let orientation: 'portrait' | 'landscape' = 'portrait';
    let marginTopMm = 20;
    let marginBottomMm = 20;
    let marginLeftMm = 30;
    let marginRightMm = 20;

    const sectPrMatch = docXml.match(/<w:sectPr(?:\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/i);
    if (sectPrMatch) {
      const sect = sectPrMatch[1];
      const pgSzMatch = sect.match(/<w:pgSz\s+([^>]+)\/>/i);
      if (pgSzMatch) {
        const attrs = pgSzMatch[1];
        const wMatch = attrs.match(/w:w="(\d+)"/i);
        const hMatch = attrs.match(/w:h="(\d+)"/i);
        const orientMatch = attrs.match(/w:orient="([^"]+)"/i);
        if (wMatch) pageWidthMm = Math.round(parseInt(wMatch[1], 10) / DXA_PER_MM);
        if (hMatch) pageHeightMm = Math.round(parseInt(hMatch[1], 10) / DXA_PER_MM);
        if (orientMatch && orientMatch[1].toLowerCase() === 'landscape') orientation = 'landscape';
      }

      const pgMarMatch = sect.match(/<w:pgMar\s+([^>]+)\/>/i);
      if (pgMarMatch) {
        const attrs = pgMarMatch[1];
        const topM = attrs.match(/w:top="(\d+)"/i);
        const bottomM = attrs.match(/w:bottom="(\d+)"/i);
        const leftM = attrs.match(/w:left="(\d+)"/i);
        const rightM = attrs.match(/w:right="(\d+)"/i);
        if (topM) marginTopMm = Math.round(parseInt(topM[1], 10) / DXA_PER_MM);
        if (bottomM) marginBottomMm = Math.round(parseInt(bottomM[1], 10) / DXA_PER_MM);
        if (leftM) marginLeftMm = Math.round(parseInt(leftM[1], 10) / DXA_PER_MM);
        if (rightM) marginRightMm = Math.round(parseInt(rightM[1], 10) / DXA_PER_MM);
      }
    }

    return {
      pageWidthMm,
      pageHeightMm,
      orientation,
      marginTopMm,
      marginBottomMm,
      marginLeftMm,
      marginRightMm,
    };
  }

  private static setParagraphAlignment(
    docXml: string,
    paragraphId: string,
    desiredAfter: ProcessorAlignment
  ): string {
    const targetIdx = parseInt(paragraphId.replace('p', ''), 10);
    if (!Number.isFinite(targetIdx) || targetIdx < 1) {
      throw new Error('TARGET_NOT_FOUND: Invalid paragraphId');
    }

    const jcVal = desiredAfter === 'JUSTIFY' ? 'both' : desiredAfter.toLowerCase();
    const newJcTag = `<w:jc w:val="${jcVal}"/>`;

    let currentIndex = 1;
    const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;

    const modified = docXml.replace(pRegex, (fullMatch, pInner) => {
      if (currentIndex !== targetIdx) {
        currentIndex++;
        return fullMatch;
      }
      currentIndex++;

      // We found the target paragraph!
      if (/<w:pPr(?:\s[^>]*)?>/i.test(pInner)) {
        // Has <w:pPr>
        let pPrUpdated: string;
        if (/<w:jc\s+[^>]*\/>/i.test(pInner)) {
          pPrUpdated = pInner.replace(/<w:jc\s+[^>]*\/>/i, newJcTag);
        } else {
          pPrUpdated = pInner.replace(/(<w:pPr(?:\s[^>]*)?>)/i, `$1${newJcTag}`);
        }
        return fullMatch.replace(pInner, pPrUpdated);
      } else {
        // No <w:pPr>, prepend one
        const newPPr = `<w:pPr>${newJcTag}</w:pPr>`;
        return fullMatch.replace(/(<w:p(?:\s[^>]*)?>)/i, `$1${newPPr}`);
      }
    });

    if (currentIndex <= targetIdx) {
      throw new Error(`TARGET_NOT_FOUND: Paragraph ${paragraphId} was not found.`);
    }

    return modified;
  }

  private static modifySectionProperties(
    docXml: string,
    options: {
      marginTopMm?: number;
      marginBottomMm?: number;
      marginLeftMm?: number;
      marginRightMm?: number;
      pageWidthMm?: number;
      pageHeightMm?: number;
      orientation?: 'portrait' | 'landscape';
    }
  ): string {
    const topDxa = options.marginTopMm !== undefined ? Math.round(options.marginTopMm * DXA_PER_MM) : undefined;
    const bottomDxa = options.marginBottomMm !== undefined ? Math.round(options.marginBottomMm * DXA_PER_MM) : undefined;
    const leftDxa = options.marginLeftMm !== undefined ? Math.round(options.marginLeftMm * DXA_PER_MM) : undefined;
    const rightDxa = options.marginRightMm !== undefined ? Math.round(options.marginRightMm * DXA_PER_MM) : undefined;
    const widthDxa = options.pageWidthMm !== undefined ? Math.round(options.pageWidthMm * DXA_PER_MM) : undefined;
    const heightDxa = options.pageHeightMm !== undefined ? Math.round(options.pageHeightMm * DXA_PER_MM) : undefined;

    return docXml.replace(/<w:sectPr(?:\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/gi, (fullMatch: string, sectInner: string) => {
      let updated = sectInner;

      // Update margins <w:pgMar .../>
      if (topDxa !== undefined || bottomDxa !== undefined || leftDxa !== undefined || rightDxa !== undefined) {
        if (/<w:pgMar\s+[^>]*\/>/i.test(updated)) {
          updated = updated.replace(/<w:pgMar\s+([^>]*)\/>/i, (_match: string, attrs: string) => {
            let a = attrs;
            if (topDxa !== undefined) a = a.replace(/w:top="\d+"/i, '').concat(` w:top="${topDxa}"`);
            if (bottomDxa !== undefined) a = a.replace(/w:bottom="\d+"/i, '').concat(` w:bottom="${bottomDxa}"`);
            if (leftDxa !== undefined) a = a.replace(/w:left="\d+"/i, '').concat(` w:left="${leftDxa}"`);
            if (rightDxa !== undefined) a = a.replace(/w:right="\d+"/i, '').concat(` w:right="${rightDxa}"`);
            return `<w:pgMar ${a.trim()}/>`;
          });
        } else {
          const mar = `<w:pgMar w:top="${topDxa ?? 1134}" w:right="${rightDxa ?? 1134}" w:bottom="${bottomDxa ?? 1134}" w:left="${leftDxa ?? 1701}" w:header="708" w:footer="708" w:gutter="0"/>`;
          updated = `${mar}${updated}`;
        }
      }

      // Update page size <w:pgSz .../>
      if (widthDxa !== undefined || heightDxa !== undefined || options.orientation !== undefined) {
        const orient = options.orientation ?? 'portrait';
        if (/<w:pgSz\s+[^>]*\/>/i.test(updated)) {
          updated = updated.replace(/<w:pgSz\s+([^>]*)\/>/i, (_match: string, attrs: string) => {
            let a = attrs;
            if (widthDxa !== undefined) a = a.replace(/w:w="\d+"/i, '').concat(` w:w="${widthDxa}"`);
            if (heightDxa !== undefined) a = a.replace(/w:h="\d+"/i, '').concat(` w:h="${heightDxa}"`);
            if (options.orientation !== undefined) a = a.replace(/w:orient="[^"]+"/i, '').concat(` w:orient="${orient}"`);
            return `<w:pgSz ${a.trim()}/>`;
          });
        } else {
          const sz = `<w:pgSz w:w="${widthDxa ?? 11906}" w:h="${heightDxa ?? 16838}" w:orient="${orient}"/>`;
          updated = `${sz}${updated}`;
        }
      }

      return `<w:sectPr>${updated}</w:sectPr>`;
    });
  }

  private static modifyFontsInXml(
    docXml: string,
    options: {
      fontFamily?: string;
      bodyFontSizePt?: number;
      paragraphIds?: string[];
    }
  ): string {
    const targetSet = options.paragraphIds ? new Set(options.paragraphIds) : null;
    let currentIndex = 1;

    return docXml.replace(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi, (fullMatch: string, pInner: string) => {
      const pId = `p${currentIndex++}`;
      if (targetSet && !targetSet.has(pId)) return fullMatch;

      // Update runs <w:r> inside this paragraph
      let updatedP = pInner.replace(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/gi, (rMatch: string, rInner: string) => {
        let updatedR = rInner;

        // Font family
        if (options.fontFamily) {
          const fontTag = `<w:rFonts w:ascii="${options.fontFamily}" w:hAnsi="${options.fontFamily}" w:cs="${options.fontFamily}"/>`;
          if (/<w:rPr(?:\s[^>]*)?>/i.test(updatedR)) {
            if (/<w:rFonts\s+[^>]*\/>/i.test(updatedR)) {
              updatedR = updatedR.replace(/<w:rFonts\s+[^>]*\/>/i, fontTag);
            } else {
              updatedR = updatedR.replace(/(<w:rPr(?:\s[^>]*)?>)/i, `$1${fontTag}`);
            }
          } else {
            updatedR = `<w:rPr>${fontTag}</w:rPr>${updatedR}`;
          }
        }

        // Font size
        if (options.bodyFontSizePt) {
          const halfPts = Math.round(options.bodyFontSizePt * 2);
          const szTag = `<w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/>`;
          if (/<w:rPr(?:\s[^>]*)?>/i.test(updatedR)) {
            if (/<w:sz\s+[^>]*\/>/i.test(updatedR)) {
              updatedR = updatedR.replace(/<w:sz\s+[^>]*\/>/i, `<w:sz w:val="${halfPts}"/>`);
            } else {
              updatedR = updatedR.replace(/(<w:rPr(?:\s[^>]*)?>)/i, `$1${szTag}`);
            }
          } else {
            updatedR = `<w:rPr>${szTag}</w:rPr>${updatedR}`;
          }
        }

        return `<w:r>${updatedR}</w:r>`;
      });

      return fullMatch.replace(pInner, updatedP);
    });
  }

  private static modifySpacingInXml(
    docXml: string,
    options: {
      lineSpacingMultiple?: number;
      spaceBeforePt?: number;
      spaceAfterPt?: number;
      firstLineIndentMm?: number;
      paragraphIds?: string[];
    }
  ): string {
    const targetSet = options.paragraphIds ? new Set(options.paragraphIds) : null;
    let currentIndex = 1;

    const lineVal = options.lineSpacingMultiple ? Math.round(options.lineSpacingMultiple * 240) : undefined;
    const beforeDxa = options.spaceBeforePt ? Math.round(options.spaceBeforePt * 20) : 0;
    const afterDxa = options.spaceAfterPt ? Math.round(options.spaceAfterPt * 20) : 0;
    const firstLineDxa = options.firstLineIndentMm ? Math.round(options.firstLineIndentMm * DXA_PER_MM) : undefined;

    return docXml.replace(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi, (fullMatch: string, pInner: string) => {
      const pId = `p${currentIndex++}`;
      if (targetSet && !targetSet.has(pId)) return fullMatch;

      let updatedP = pInner;

      // Spacing tag: <w:spacing .../>
      if (lineVal !== undefined || beforeDxa !== undefined || afterDxa !== undefined) {
        const spacingTag = `<w:spacing w:before="${beforeDxa}" w:after="${afterDxa}" ${lineVal ? `w:line="${lineVal}" w:lineRule="auto"` : ''}/>`;
        if (/<w:pPr(?:\s[^>]*)?>/i.test(updatedP)) {
          if (/<w:spacing\s+[^>]*\/>/i.test(updatedP)) {
            updatedP = updatedP.replace(/<w:spacing\s+[^>]*\/>/i, spacingTag);
          } else {
            updatedP = updatedP.replace(/(<w:pPr(?:\s[^>]*)?>)/i, `$1${spacingTag}`);
          }
        } else {
          updatedP = `<w:pPr>${spacingTag}</w:pPr>${updatedP}`;
        }
      }

      // First line indent: <w:ind w:firstLine="..."/>
      if (firstLineDxa !== undefined) {
        const indTag = `<w:ind w:firstLine="${firstLineDxa}"/>`;
        if (/<w:pPr(?:\s[^>]*)?>/i.test(updatedP)) {
          if (/<w:ind\s+[^>]*\/>/i.test(updatedP)) {
            updatedP = updatedP.replace(/<w:ind\s+[^>]*\/>/i, indTag);
          } else {
            updatedP = updatedP.replace(/(<w:pPr(?:\s[^>]*)?>)/i, `$1${indTag}`);
          }
        } else {
          updatedP = `<w:pPr>${indTag}</w:pPr>${updatedP}`;
        }
      }

      return fullMatch.replace(pInner, updatedP);
    });
  }
}
