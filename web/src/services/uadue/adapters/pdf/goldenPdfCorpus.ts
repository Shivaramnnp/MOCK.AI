/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Module: Golden PDF Corpus Generator & Fixture Suite (Phase 2A)
 *
 * Generates standards-compliant, byte-exact PDF binaries representing the
 * 12 core forensic examination challenges:
 *
 * GC-01: Native digital text PDF
 * GC-02: GATE mathematics-heavy PDF
 * GC-03: SSC/TCS-style assessment PDF
 * GC-04: Multi-column examination PDF
 * GC-05: PDF with vector geometric diagrams
 * GC-06: PDF with embedded raster image options
 * GC-07: PDF with tabular grid lattices
 * GC-08: PDF with rotated text orientation (90 / 270 deg)
 * GC-09: PDF with custom/unusual font encodings
 * GC-10: Scanned PDF simulation (full-page raster)
 * GC-11: Mixed raster XObject and vector path content
 * GC-12: Multi-page assessment document (5 pages)
 */

export interface GoldenPdfFixture {
  suiteId: string;
  name: string;
  description: string;
  corpusCategory: 'SYNTHETIC_UNIT_FIXTURE';
  expectedPageCount: number;
  expectedHasMath: boolean;
  expectedHasVectors: boolean;
  expectedHasImages: boolean;
  pdfBytes: Uint8Array;
}

/**
 * Low-level PDF binary builder that outputs strictly valid PDF-1.4 documents
 * with exact cross-reference tables and trailers.
 */
class RawPdfBuilder {
  private objects: string[] = [];

  addObject(content: string): number {
    this.objects.push(content);
    return this.objects.length; // 1-indexed object number
  }

  build(): Uint8Array {
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (let i = 0; i < this.objects.length; i++) {
      offsets.push(out.length);
      const objNum = i + 1;
      out += `${objNum} 0 obj\n${this.objects[i]}\nendobj\n`;
    }

    const startXref = out.length;
    out += `xref\n0 ${this.objects.length + 1}\n`;
    out += '0000000000 65535 f \n';

    for (const offset of offsets) {
      out += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }

    out += `trailer\n<< /Size ${this.objects.length + 1} /Root 1 0 R >>\n`;
    out += `startxref\n${startXref}\n%%EOF\n`;

    return new TextEncoder().encode(out);
  }
}

export class GoldenPdfCorpus {
  /**
   * GC-01: Native Digital Text PDF
   */
  static createGc01NativeText(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    // 1: Catalog
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    // 2: Pages
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    // 3: Page
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    // 4: Contents
    const stream = 'BT /F1 12 Tf 72 700 Td (UPSC Civil Services Examination Preliminary Paper) Tj 0 -20 Td (Question 1: Which of the following statements is correct regarding monetary policy?) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    // 5: Font
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-01-NATIVE-TEXT',
      name: 'UPSC Native Text Examination Paper',
      description: 'Clean digital native text with standard margins and Type1 fonts',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-02: GATE Mathematics-Heavy PDF
   */
  static createGc02GateMath(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    const stream = 'BT /F1 12 Tf 72 700 Td (GATE 2024 Computer Science and Information Technology) Tj 0 -25 Td (Q.12 Evaluate the definite integral: I = \\int_{0}^{\\pi} x \\sin(x) dx) Tj 0 -20 Td (Given that f(x) = O(n log n) and g(x) = \\Omega(n^2), compute the asymptotic bound.) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-02-GATE-MATH',
      name: 'GATE Mathematics & Algorithms Paper',
      description: 'Heavy mathematical formulas with integral notations and asymptotic bounds',
      expectedPageCount: 1,
      expectedHasMath: true,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-03: SSC/TCS-Style Assessment PDF
   */
  static createGc03SscChsl(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    const stream = 'BT /F1 10 Tf 50 720 Td (Staff Selection Commission - CHSL Tier 1 Examination) Tj 0 -20 Td (Q.26 GAMU is related to JDPX in a certain way...) Tj 0 -15 Td (Option 1: EUOT) Tj 0 -15 Td (Option 2: DINS) Tj 0 -15 Td (Option 3: ETOS) Tj 0 -15 Td (Option 4: CTOU) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-03-SSC-CHSL',
      name: 'SSC CHSL TCS Assessment Response Sheet',
      description: '4-option MCQ format with standard candidate response markers',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-04: Multi-Column Examination PDF
   */
  static createGc04MultiColumn(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    // Column 1 at x=50, Column 2 at x=320
    const stream = 'BT /F1 10 Tf 50 700 Td (Column 1 Item 1) Tj 0 -20 Td (Column 1 Item 2) Tj 0 -20 Td (Column 1 Item 3) Tj ET BT /F1 10 Tf 320 700 Td (Column 2 Item 1) Tj 0 -20 Td (Column 2 Item 2) Tj 0 -20 Td (Column 2 Item 3) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-04-MULTI-COLUMN',
      name: 'Two-Column Assessment Paper',
      description: 'Strict two-column layout with independent column reading order',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-05: PDF with Vector Geometric Diagrams
   */
  static createGc05Diagrams(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    // Text + Vector rectangle and diagonal line
    const stream = 'BT /F1 12 Tf 72 700 Td (Q.5 In the triangle shown below, find angle theta:) Tj ET 1.5 w 100 500 200 150 re S 100 500 m 300 650 l S';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-05-DIAGRAMS',
      name: 'Geometry Paper with Vector Paths',
      description: 'Contains path draw calls (re, m, l, S) with explicit stroke widths',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: true,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-06: PDF with Image-Based Options
   */
  static createGc06ImageOptions(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>');
    // Draw text and paint XObject image Im1
    const stream = 'BT /F1 12 Tf 72 700 Td (Q.32 Select the figure that correctly replaces the question mark:) Tj ET q 150 0 0 150 100 500 cm /Im1 Do Q';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    // Object 6: 1x1 black pixel sample image
    const rawImg = '\x00';
    b.addObject(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n${rawImg}\nendstream`);

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-06-IMAGE-OPTIONS',
      name: 'Visual Reasoning Paper with Image Options',
      description: 'Contains embedded XObject raster image options and transformation matrix',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: true,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-07: PDF with Tabular Grid Lattices
   */
  static createGc07Tables(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    // Draw table border grid (re, S) and cell text
    const stream = 'BT /F1 11 Tf 72 720 Td (Study the following data table and answer the questions:) Tj ET 1.0 w 72 550 400 120 re S 72 610 m 472 610 l S 272 550 m 272 670 l S BT /F1 10 Tf 80 640 Td (Year: 2023) Tj 200 0 Td (Revenue: 10M) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-07-TABLES',
      name: 'Data Interpretation Tabular Assessment',
      description: 'Contains closed table grid borders and nested cell text items',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: true,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-08: PDF with Rotated Text Orientation
   */
  static createGc08RotatedText(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    // Page with /Rotate 90
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    const stream = 'BT /F1 12 Tf 100 400 Td (Landscape Table Orientation) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-08-ROTATED-TEXT',
      name: 'Landscape / Rotated Examination Page',
      description: 'Page with 90 degree rotation and non-standard coordinate orientation',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-09: PDF with Custom/Unusual Font Encodings
   */
  static createGc09UnusualFonts(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F2 5 0 R >> >> >>');
    const stream = 'BT /F2 12 Tf 72 700 Td (Assessment Paper in Custom Font) Tj ET';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    // Font with Type0 CIDFont mapping
    b.addObject('<< /Type /Font /Subtype /TrueType /BaseFont /CustomExamFont /Encoding /WinAnsiEncoding >>');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-09-UNUSUAL-FONTS',
      name: 'Paper with Custom TrueType Font Encoding',
      description: 'Embedded TrueType font with specific WinAnsiEncoding dictionary',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-10: Scanned PDF Simulation
   */
  static createGc10ScannedPdf(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Scan1 5 0 R >> >> >>');
    // Full-page raster image with zero native text
    const stream = 'q 612 0 0 792 0 0 cm /Scan1 Do Q';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x00\xFF\x80\x40\nendstream');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-10-SCANNED-PDF',
      name: 'Scanned 200 DPI Physical Document',
      description: 'Zero native text streams; entire page content contained in raster XObject',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: true,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-11: Mixed Raster and Vector Content
   */
  static createGc11MixedContent(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    b.addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Photo1 6 0 R >> >> >>');
    const stream = 'BT /F1 12 Tf 72 700 Td (Mixed Multimodal Stimulus Question) Tj ET 2.0 w 50 450 300 200 re S q 100 0 0 100 60 460 cm /Photo1 Do Q';
    b.addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    b.addObject('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\xFF\nendstream');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-11-MIXED-CONTENT',
      name: 'Mixed Multimodal Document',
      description: 'Combines native text, vector path borders, and raster photographic assets',
      expectedPageCount: 1,
      expectedHasMath: false,
      expectedHasVectors: true,
      expectedHasImages: true,
      pdfBytes: b.build(),
    };
  }

  /**
   * GC-12: Multi-Page Assessment Document (5 Pages)
   */
  static createGc12MultiPage(): GoldenPdfFixture {
    const b = new RawPdfBuilder();
    // 1: Catalog
    b.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    // 2: Pages container
    b.addObject('<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R 10 0 R 12 0 R] /Count 5 >>');

    // Page 1
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    b.addObject('<< /Length 50 >>\nstream\nBT /F1 12 Tf 72 700 Td (Page 1 of 5: General Instructions) Tj ET\nendstream');
    b.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    // Page 2
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    b.addObject('<< /Length 45 >>\nstream\nBT /F1 12 Tf 72 700 Td (Page 2 of 5: Section 1 Questions) Tj ET\nendstream');

    // Page 3
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 9 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    b.addObject('<< /Length 45 >>\nstream\nBT /F1 12 Tf 72 700 Td (Page 3 of 5: Section 2 Questions) Tj ET\nendstream');

    // Page 4
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 11 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    b.addObject('<< /Length 45 >>\nstream\nBT /F1 12 Tf 72 700 Td (Page 4 of 5: Section 3 Questions) Tj ET\nendstream');

    // Page 5
    b.addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 13 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    b.addObject('<< /Length 45 >>\nstream\nBT /F1 12 Tf 72 700 Td (Page 5 of 5: End of Examination) Tj ET\nendstream');

    return {
      corpusCategory: 'SYNTHETIC_UNIT_FIXTURE',
      suiteId: 'GC-12-MULTI-PAGE',
      name: '5-Page Comprehensive Examination Booklet',
      description: 'Multiple pages testing cross-page state continuity and resource isolation',
      expectedPageCount: 5,
      expectedHasMath: false,
      expectedHasVectors: false,
      expectedHasImages: false,
      pdfBytes: b.build(),
    };
  }

  /**
   * Returns all 12 Golden Corpus benchmark fixtures.
   */
  static getAllGoldenFixtures(): GoldenPdfFixture[] {
    return [
      this.createGc01NativeText(),
      this.createGc02GateMath(),
      this.createGc03SscChsl(),
      this.createGc04MultiColumn(),
      this.createGc05Diagrams(),
      this.createGc06ImageOptions(),
      this.createGc07Tables(),
      this.createGc08RotatedText(),
      this.createGc09UnusualFonts(),
      this.createGc10ScannedPdf(),
      this.createGc11MixedContent(),
      this.createGc12MultiPage(),
    ];
  }
}
