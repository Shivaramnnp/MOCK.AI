export type IngestionErrorCode =
  | 'INVALID_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'EXTRACTION_FAILED'
  | 'OCR_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'SOURCE_UNAVAILABLE'
  | 'URL_BLOCKED'
  | 'SSRF_BLOCKED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_RATE_LIMIT'
  | 'INVALID_AI_OUTPUT'
  | 'QUESTION_VALIDATION_FAILED'
  | 'ASSET_EXTRACTION_FAILED'
  | 'STORAGE_FAILED'
  | 'REVIEW_REQUIRED';

export interface IngestionErrorPayload {
  code: IngestionErrorCode;
  userMessage: string;
  technicalMessage: string;
  retryable: boolean;
  sourceStage?: string;
  details?: Record<string, unknown>;
}

export class IngestionError extends Error implements IngestionErrorPayload {
  readonly code: IngestionErrorCode;
  readonly userMessage: string;
  readonly technicalMessage: string;
  readonly retryable: boolean;
  readonly sourceStage?: string;
  readonly details?: Record<string, unknown>;

  constructor(payload: IngestionErrorPayload) {
    super(payload.technicalMessage || payload.userMessage);
    this.name = 'IngestionError';
    this.code = payload.code;
    this.userMessage = payload.userMessage;
    this.technicalMessage = payload.technicalMessage;
    this.retryable = payload.retryable;
    this.sourceStage = payload.sourceStage;
    this.details = payload.details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, IngestionError.prototype);
  }

  toJSON(): IngestionErrorPayload {
    return {
      code: this.code,
      userMessage: this.userMessage,
      technicalMessage: this.technicalMessage,
      retryable: this.retryable,
      sourceStage: this.sourceStage,
      details: this.details,
    };
  }
}

export function isIngestionError(err: unknown): err is IngestionError {
  return err instanceof IngestionError || (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'userMessage' in err &&
    'retryable' in err
  );
}

export function createIngestionError(
  code: IngestionErrorCode,
  userMessage: string,
  technicalMessage: string,
  retryable = false,
  sourceStage?: string,
  details?: Record<string, unknown>
): IngestionError {
  return new IngestionError({
    code,
    userMessage,
    technicalMessage,
    retryable,
    sourceStage,
    details,
  });
}
