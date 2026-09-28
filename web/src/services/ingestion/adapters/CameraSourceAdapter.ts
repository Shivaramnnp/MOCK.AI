import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { ImageSourceAdapter } from './ImageSourceAdapter';

export interface CameraInput {
  base64Data: string;
  timestamp?: number;
}

export class CameraSourceAdapter implements SourceAdapter<CameraInput> {
  readonly sourceType = 'Camera';
  private imageAdapter = new ImageSourceAdapter();

  async validateInput(input: CameraInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.base64Data) {
      return { valid: false, error: 'Camera snapshot data is missing.' };
    }
    return this.imageAdapter.validateInput({
      base64Data: input.base64Data,
      mimeType: 'image/jpeg',
    });
  }

  async process(input: CameraInput, options?: IngestionOptions): Promise<IngestionResult> {
    const res = await this.imageAdapter.process(
      {
        base64Data: input.base64Data,
        mimeType: 'image/jpeg',
        fileName: 'Live Camera Scan',
      },
      options
    );

    // Override source type to Camera
    res.sourceType = 'Camera';
    res.sourceTitle = 'Live Camera Scanned Exam';
    res.questions.forEach((q) => {
      q.sourceType = 'Camera';
      q.provenance.sourceType = 'Camera';
    });

    return res;
  }
}
