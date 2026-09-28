import { InputSourceType } from '../../types';
import { SourceAdapter, IngestionOptions, IngestionResult } from './adapters/SourceAdapter';
import { PdfSourceAdapter } from './adapters/PdfSourceAdapter';
import { OfficeSourceAdapter } from './adapters/OfficeSourceAdapter';
import { TopicSourceAdapter } from './adapters/TopicSourceAdapter';
import { YouTubeSourceAdapter } from './adapters/YouTubeSourceAdapter';
import { WebUrlSourceAdapter } from './adapters/WebUrlSourceAdapter';
import { ImageSourceAdapter } from './adapters/ImageSourceAdapter';
import { CameraSourceAdapter } from './adapters/CameraSourceAdapter';
import { AudioSourceAdapter } from './adapters/AudioSourceAdapter';
import { ManualSourceAdapter } from './adapters/ManualSourceAdapter';
import { JsonSourceAdapter } from './adapters/JsonSourceAdapter';
import { createIngestionError } from '../../types/ingestionErrors';

class IngestionService {
  private adapters: Map<InputSourceType, SourceAdapter> = new Map();

  constructor() {
    this.registerAdapter(new PdfSourceAdapter());
    this.registerAdapter(new OfficeSourceAdapter());
    this.registerAdapter(new TopicSourceAdapter());
    this.registerAdapter(new YouTubeSourceAdapter());
    this.registerAdapter(new WebUrlSourceAdapter());
    this.registerAdapter(new ImageSourceAdapter());
    this.registerAdapter(new CameraSourceAdapter());
    this.registerAdapter(new AudioSourceAdapter());
    this.registerAdapter(new ManualSourceAdapter());
    this.registerAdapter(new JsonSourceAdapter());
  }

  registerAdapter(adapter: SourceAdapter) {
    this.adapters.set(adapter.sourceType, adapter);
  }

  getAdapter(sourceType: InputSourceType): SourceAdapter {
    const adapter = this.adapters.get(sourceType);
    if (!adapter) {
      throw createIngestionError(
        'UNSUPPORTED_FORMAT',
        `Source type "${sourceType}" is not supported by the ingestion engine.`,
        `No adapter registered for ${sourceType}`,
        false,
        'ROUTING'
      );
    }
    return adapter;
  }

  async validate(sourceType: InputSourceType, payload: any): Promise<{ valid: boolean; error?: string }> {
    const adapter = this.getAdapter(sourceType);
    return adapter.validateInput(payload);
  }

  async ingest(
    sourceType: InputSourceType,
    payload: any,
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    const adapter = this.getAdapter(sourceType);
    const validation = await adapter.validateInput(payload);
    if (!validation.valid) {
      throw createIngestionError(
        'INVALID_FILE',
        validation.error || 'Input validation failed for this source.',
        `Validation rejected by ${sourceType} adapter: ${validation.error}`,
        false,
        'VALIDATION'
      );
    }

    return adapter.process(payload, options);
  }
}

export const ingestionService = new IngestionService();
