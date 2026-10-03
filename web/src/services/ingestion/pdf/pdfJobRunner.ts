import { PdfJobStage, PdfJobProgress } from './types';

export interface JobState {
  jobId: string;
  documentHash: string;
  fileName: string;
  stage: PdfJobStage;
  percent: number;
  currentPage: number;
  totalPages: number;
  questionsFound: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

const JOB_STORAGE_PREFIX = 'mockai_pdf_job_';

/**
 * Manages bounded concurrency, progress reporting, and persistent checkpointing
 * across the multi-stage PDF ingestion pipeline.
 */
export class PdfJobRunner {
  private state: JobState;
  private onProgressCallback?: (progress: PdfJobProgress) => void;

  constructor(
    jobId: string,
    documentHash: string,
    fileName: string,
    totalPages: number = 0,
    onProgress?: (progress: PdfJobProgress) => void
  ) {
    this.onProgressCallback = onProgress;
    this.state = {
      jobId,
      documentHash,
      fileName,
      stage: 'QUEUED',
      percent: 0,
      currentPage: 0,
      totalPages,
      questionsFound: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.saveState();
  }

  updateProgress(stage: PdfJobStage, percent: number, message: string, extras?: Partial<JobState>): void {
    this.state = {
      ...this.state,
      stage,
      percent: Math.min(100, Math.max(0, percent)),
      updatedAt: Date.now(),
      ...extras,
    };

    this.saveState();

    if (this.onProgressCallback) {
      this.onProgressCallback({
        stage: this.state.stage,
        percent: this.state.percent,
        currentPage: this.state.currentPage,
        totalPages: this.state.totalPages,
        questionsFound: this.state.questionsFound,
        message,
        error: this.state.error,
      });
    }
  }

  fail(errorMessage: string): void {
    this.state.stage = 'FAILED';
    this.state.error = errorMessage;
    this.state.updatedAt = Date.now();
    this.saveState();

    if (this.onProgressCallback) {
      this.onProgressCallback({
        stage: 'FAILED',
        percent: this.state.percent,
        message: `Failed: ${errorMessage}`,
        error: errorMessage,
      });
    }
  }

  getState(): JobState {
    return { ...this.state };
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${JOB_STORAGE_PREFIX}${this.state.jobId}`, JSON.stringify(this.state));
    } catch {
      // ignore quota errors
    }
  }

  /**
   * Executes an asynchronous task over items in batches with bounded concurrency.
   * Prevents browser UI freezing and uncontrolled memory spikes.
   */
  static async executeBoundedBatch<TItem, TResult>(
    items: TItem[],
    batchSize: number,
    processor: (item: TItem, index: number) => Promise<TResult>
  ): Promise<TResult[]> {
    const results: TResult[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const chunkResults = await Promise.all(
        chunk.map((item, offset) => processor(item, i + offset))
      );
      results.push(...chunkResults);
    }
    return results;
  }
}
