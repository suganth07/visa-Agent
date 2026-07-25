import { ToolDecorator as Tool, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { DocumentService } from './document.service.js';
import { VisaCaseService } from '../case/case.service.js';

/**
 * DocumentTools
 *
 * Fourth vertical slice: uploads a document against an existing case, runs
 * a deterministic OCR stub over it, and validates the extracted fields
 * against that case.
 *
 * Cross-module access follows the same NitroStack DI pattern as the
 * Onboarding and Requirement modules: VisaCaseService is injected from the
 * Case Module and called directly — never over HTTP, and never by invoking
 * another module's tool.
 *
 * TODO(document): required scopes per docs/ARCHITECTURE.md §15 would be
 * `document:write` for upload and `document:read` for OCR/validation.
 * OAuthGuard is applied for consistency with the rest of the codebase; no
 * fine-grained scope or tenant check is enforced yet.
 * TODO(document): no audit logging or event emission yet.
 */
@Injectable({ deps: [DocumentService, VisaCaseService] })
export class DocumentTools {
    constructor(
        private documentService: DocumentService,
        private visaCaseService: VisaCaseService
    ) { }

    @Tool({
        name: 'document_upload',
        description: 'Uploads a document against an existing visa case and stores it in memory. Verifies the case exists first. No virus scanning, object storage, or persistence is performed — content is held in process memory only.',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID returned by case_start or onboarding_extract'),
            documentType: z.string().describe('Document type, e.g. "passport" or "visa_letter"'),
            fileName: z.string().describe('Original file name, e.g. "passport.txt"'),
            contentBase64: z.string().describe('Base64-encoded document content')
        }),
        examples: {
            request: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                documentType: 'passport',
                fileName: 'passport.txt',
                contentBase64: 'TmF0aW9uYWxpdHk6IEluZGlh'
            },
            response: {
                documentId: '9c1f0e2a-77b4-4c3d-9a51-1f7e2b6d8c40',
                status: 'UPLOADED',
                uploadedAt: '2025-01-01T00:00:00.000Z'
            }
        }
    })
    @UseGuards(OAuthGuard)
    async documentUpload(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Uploading document for case', {
            user: ctx.auth?.subject,
            caseId: input.caseId,
            documentType: input.documentType
        });

        // 1. Verify the case exists via VisaCaseService. Throws if it does not,
        //    so a document can never be orphaned from a case.
        const visaCase = await this.visaCaseService.getCase(input.caseId);

        // 2. Store the document in memory against that case.
        const record = await this.documentService.uploadDocument({
            caseId: visaCase.caseId,
            documentType: input.documentType,
            fileName: input.fileName,
            contentBase64: input.contentBase64
        });

        ctx.logger.info('Document uploaded', {
            user: ctx.auth?.subject,
            caseId: visaCase.caseId,
            documentId: record.documentId
        });

        return {
            documentId: record.documentId,
            status: record.status,
            uploadedAt: record.uploadTime
        };
    }

    @Tool({
        name: 'document_ocr',
        description: 'Runs deterministic field extraction over a previously uploaded document. Passports yield fullName, nationality, passportNumber, and expiryDate; visa letters yield university, country, and intake; any other type yields plain extracted text. This is a local stub — no OCR vendor, model, or network call is involved.',
        inputSchema: z.object({
            documentId: z.string().describe('The document ID returned by document_upload')
        }),
        examples: {
            request: {
                documentId: '9c1f0e2a-77b4-4c3d-9a51-1f7e2b6d8c40'
            },
            response: {
                documentId: '9c1f0e2a-77b4-4c3d-9a51-1f7e2b6d8c40',
                documentType: 'passport',
                kind: 'passport',
                extractedFields: {
                    fullName: 'ANJALI SHARMA',
                    nationality: 'India',
                    passportNumber: 'Z1234567',
                    expiryDate: '2030-04-18'
                },
                extractedAt: '2025-01-01T00:00:00.000Z'
            }
        }
    })
    @UseGuards(OAuthGuard)
    async documentOcr(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Running document extraction', {
            user: ctx.auth?.subject,
            documentId: input.documentId
        });

        const record = await this.documentService.getDocument(input.documentId);
        const ocr = await this.documentService.runOcr(record.documentId);

        ctx.logger.info('Document extraction complete', {
            user: ctx.auth?.subject,
            documentId: record.documentId,
            kind: ocr.kind
        });

        return {
            documentId: record.documentId,
            documentType: record.documentType,
            kind: ocr.kind,
            extractedAt: ocr.extractedAt,
            ...(ocr.kind === 'unknown'
                ? { extractedText: ocr.extractedText }
                : { extractedFields: ocr.extractedFields })
        };
    }

    @Tool({
        name: 'document_validate',
        description: 'Validates a document\'s extracted fields against its visa case: nationality match, destination present, recognized document type, and passport expiry. Returns a deterministic pass/fail breakdown. A VALID result means the local checks passed — it is not document acceptance.',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID the document belongs to'),
            documentId: z.string().describe('The document ID returned by document_upload')
        }),
        examples: {
            request: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                documentId: '9c1f0e2a-77b4-4c3d-9a51-1f7e2b6d8c40'
            },
            response: {
                status: 'VALID',
                confidence: 1,
                passedChecks: [
                    'required_document_type_recognized',
                    'case_destination_present',
                    'nationality_matches_case',
                    'passport_not_expired'
                ],
                failedChecks: [],
                extractedFields: {
                    fullName: 'ANJALI SHARMA',
                    nationality: 'India',
                    passportNumber: 'Z1234567',
                    expiryDate: '2030-04-18'
                }
            }
        }
    })
    @UseGuards(OAuthGuard)
    async documentValidate(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Validating document against case', {
            user: ctx.auth?.subject,
            caseId: input.caseId,
            documentId: input.documentId
        });

        // 1. Retrieve the case via VisaCaseService.
        const visaCase = await this.visaCaseService.getCase(input.caseId);

        // 2. Confirm the document actually belongs to that case. A mismatch is
        //    a malformed request, not a validation failure, so it throws rather
        //    than returning INVALID.
        const record = await this.documentService.getDocument(input.documentId);
        if (record.caseId !== visaCase.caseId) {
            throw new Error(
                `Document ${record.documentId} does not belong to case ${visaCase.caseId}.`
            );
        }

        // 3. Compare extracted fields against the case.
        const result = await this.documentService.validateAgainstCase(record.documentId, visaCase);

        ctx.logger.info('Document validation complete', {
            user: ctx.auth?.subject,
            caseId: visaCase.caseId,
            documentId: record.documentId,
            status: result.status
        });

        return result;
    }
}
