/**
 * The single place this app touches the MCP host.
 *
 * Every screen goes through `callTool` here — there is no mock data and no
 * second transport. `WidgetSDK.callTool` delegates to `window.openai.callTool`,
 * which the host injects into the widget iframe; that is why this app must run
 * inside an MCP host (NitroStudio) rather than as a standalone page.
 */

import { getWidgetSDK } from '@nitrostack/widgets';
import type {
  CaseGetOutput,
  CaseStartOutput,
  DocumentOcrOutput,
  DocumentUploadOutput,
  DocumentValidateOutput,
  OnboardingExtractOutput,
  ResolveRequirementsOutput,
} from './types';

/** Error carrying enough context for the UI to explain what failed. */
export class ToolCallError extends Error {
  constructor(
    message: string,
    readonly toolName: string,
    readonly kind: 'not-ready' | 'tool-error' | 'bad-response' = 'tool-error',
  ) {
    super(message);
    this.name = 'ToolCallError';
  }
}

/** True once the host has injected its bridge. */
export function isHostReady(): boolean {
  try {
    return getWidgetSDK().isReady();
  } catch {
    return false;
  }
}

/**
 * The host returns `{ result: string, structuredContent?: unknown }`.
 * Prefer `structuredContent` when present; otherwise parse `result` as JSON.
 * Some hosts wrap the payload in an MCP envelope, so unwrap that too.
 */
function unwrap<T>(raw: unknown, toolName: string): T {
  if (raw == null || typeof raw !== 'object') {
    throw new ToolCallError(`${toolName} returned an empty response.`, toolName, 'bad-response');
  }

  const envelope = raw as {
    result?: unknown;
    structuredContent?: unknown;
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (envelope.isError) {
    const detail = typeof envelope.result === 'string' ? envelope.result : 'Tool reported an error.';
    throw new ToolCallError(detail, toolName, 'tool-error');
  }

  if (envelope.structuredContent != null && typeof envelope.structuredContent === 'object') {
    return envelope.structuredContent as T;
  }

  // MCP content array: take the first text part and parse it.
  if (Array.isArray(envelope.content)) {
    const text = envelope.content.find((p) => typeof p?.text === 'string')?.text;
    if (text) return parseJson<T>(text, toolName);
  }

  if (typeof envelope.result === 'string') {
    return parseJson<T>(envelope.result, toolName);
  }

  if (envelope.result != null && typeof envelope.result === 'object') {
    return envelope.result as T;
  }

  return raw as T;
}

function parseJson<T>(text: string, toolName: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ToolCallError(
      `${toolName} returned a response this screen could not read.`,
      toolName,
      'bad-response',
    );
  }
}

/**
 * Invoke a backend tool by name.
 *
 * Surfaces the "no host bridge" case explicitly instead of letting the SDK's
 * generic `Widget SDK not ready` bubble up, because that is by far the most
 * likely failure and the user needs to be told what to do about it.
 */
export async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const sdk = getWidgetSDK();

  if (!sdk.isReady()) {
    throw new ToolCallError(
      'Not connected to the MigrateEase server. Open this app from NitroStudio so it can connect.',
      name,
      'not-ready',
    );
  }

  let raw: unknown;
  try {
    raw = await sdk.callTool(name, args);
  } catch (err) {
    throw new ToolCallError(
      err instanceof Error ? err.message : `Could not reach ${name}.`,
      name,
      'tool-error',
    );
  }

  return unwrap<T>(raw, name);
}

/**
 * Typed wrappers, one per backend tool. Screens call these, never `callTool`
 * directly, so tool names and argument shapes live in exactly one file.
 */
export const api = {
  caseStart: (args: { destinationCountry: string; nationality: string; visaType: string }) =>
    callTool<CaseStartOutput>('case_start', args),

  caseGet: (caseId: string) => callTool<CaseGetOutput>('case_get', { caseId }),

  onboardingExtract: (message: string) =>
    callTool<OnboardingExtractOutput>('onboarding_extract', { message }),

  resolveRequirements: (caseId: string) =>
    callTool<ResolveRequirementsOutput>('resolve_requirements', { caseId }),

  documentUpload: (args: {
    caseId: string;
    documentType: string;
    fileName: string;
    contentBase64: string;
  }) => callTool<DocumentUploadOutput>('document_upload', args),

  documentOcr: (documentId: string) =>
    callTool<DocumentOcrOutput>('document_ocr', { documentId }),

  documentValidate: (args: { caseId: string; documentId: string }) =>
    callTool<DocumentValidateOutput>('document_validate', args),
};

/** Normalizes anything thrown into a message worth showing a user. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof ToolCallError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
