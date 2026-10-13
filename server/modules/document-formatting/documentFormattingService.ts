import { createHash } from 'crypto';
import { userFileService } from '../../core/files/firebaseFileStores';
import { LocalDocxProcessor } from '../../core/documents/localDocxProcessor';
import { sanitizeDisplayFilename } from '../../core/files/filePolicy';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { FileDomainError } from '../../core/files/UserFileService';
import {
  FormattingPlan,
  FORMATTING_PROFILES,
  ProfileId,
} from '../../../shared/contracts/formattingProfiles';
import { ProcessorAlignment } from '../../core/documents/documentProcessorClient';

const processor = new LocalDocxProcessor();

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class DocumentFormattingService {
  public static getProfiles() {
    return Object.values(FORMATTING_PROFILES);
  }

  public static async inspectDocument(ownerId: string, fileId: string, signal?: AbortSignal) {
    const { file, bytes } = await userFileService.readBytes(ownerId, fileId, MAX_FILE_BYTES, signal);
    if (file.mimeType !== DOCX_MIME_TYPE || !file.originalName.toLowerCase().endsWith('.docx')) {
      throw new FileDomainError('FILE_TYPE_MISMATCH', 415, 'Tệp được chọn không phải tài liệu DOCX.');
    }

    const inspection = await processor.inspect(bytes, signal);
    return {
      sourceFile: file,
      inspection,
    };
  }

  public static async analyzeDocument(
    ownerId: string,
    fileId: string,
    profileId: ProfileId = 'nghi-dinh-30',
    signal?: AbortSignal
  ) {
    const { file, bytes } = await userFileService.readBytes(ownerId, fileId, MAX_FILE_BYTES, signal);
    if (file.mimeType !== DOCX_MIME_TYPE || !file.originalName.toLowerCase().endsWith('.docx')) {
      throw new FileDomainError('FILE_TYPE_MISMATCH', 415, 'Tệp được chọn không phải tài liệu DOCX.');
    }

    const analysis = await processor.analyzeFormatting(bytes, fileId, profileId);
    return {
      sourceFile: file,
      ...analysis,
    };
  }

  public static async applyFormattingPlan(
    ownerId: string,
    fileId: string,
    plan: FormattingPlan,
    signal?: AbortSignal
  ) {
    const { file: sourceFile, bytes: sourceBytes } = await userFileService.readBytes(
      ownerId,
      fileId,
      MAX_FILE_BYTES,
      signal
    );

    const actualSourceSha = sha256(sourceBytes);
    if (actualSourceSha.toLowerCase() !== plan.sourceSha256.toLowerCase()) {
      throw new FileDomainError('STALE_DOCUMENT', 409, 'Tệp Word gốc đã thay đổi kể từ khi tạo kế hoạch định dạng.');
    }

    const applied = await processor.applyFormattingPlan(sourceBytes, plan);

    // Save as new immutable artifact
    const baseName = sourceFile.originalName.replace(/\.docx$/i, '') || 'document';
    const outputName = sanitizeDisplayFilename(`${baseName}-dinh-dang.docx`);
    const outputFile = await userFileService.store(ownerId, {
      originalName: outputName,
      mimeType: DOCX_MIME_TYPE,
      bytes: applied.bytes,
      avoidFileId: sourceFile.fileId,
      signal,
    });

    return {
      success: true as const,
      sourceFileId: sourceFile.fileId,
      outputFile,
      operationsApplied: applied.operationsApplied,
      changeManifest: {
        sourceSha256: actualSourceSha,
        outputSha256: applied.sha256,
        profileId: plan.profileId,
        operationsCount: applied.operationsApplied,
        appliedAt: new Date().toISOString(),
      },
      verification: applied.verification,
    };
  }

  public static async applyAlignment(
    ownerId: string,
    input: {
      fileId: string;
      sourceSha256: string;
      paragraphId: string;
      expectedBefore: ProcessorAlignment;
      desiredAfter: ProcessorAlignment;
    },
    signal?: AbortSignal
  ) {
    const { file: sourceFile, bytes: sourceBytes } = await userFileService.readBytes(
      ownerId,
      input.fileId,
      MAX_FILE_BYTES,
      signal
    );

    const actualSourceSha = sha256(sourceBytes);
    if (actualSourceSha.toLowerCase() !== input.sourceSha256.toLowerCase()) {
      throw new FileDomainError('STALE_DOCUMENT', 409, 'Tệp Word gốc đã thay đổi kể từ khi kiểm tra.');
    }

    const applied = await processor.applyAlignment({
      bytes: sourceBytes,
      sourceSha256: actualSourceSha,
      paragraphId: input.paragraphId,
      expectedBefore: input.expectedBefore,
      desiredAfter: input.desiredAfter,
    }, signal);

    const baseName = sourceFile.originalName.replace(/\.docx$/i, '') || 'document';
    const outputName = sanitizeDisplayFilename(`${baseName}-can-le.docx`);
    const outputFile = await userFileService.store(ownerId, {
      originalName: outputName,
      mimeType: DOCX_MIME_TYPE,
      bytes: applied.bytes,
      avoidFileId: sourceFile.fileId,
      signal,
    });

    return {
      success: true as const,
      sourceFileId: sourceFile.fileId,
      outputFile,
      changeManifest: {
        property: 'paragraph.alignment',
        paragraphId: input.paragraphId,
        before: input.expectedBefore,
        after: input.desiredAfter,
        sourceSha256: actualSourceSha,
        outputSha256: applied.sha256,
        appliedAt: new Date().toISOString(),
      },
    };
  }
}
