/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Registry: Real-World Public Examination Golden Corpus Registry (Phase 2A Remediation)
 *
 * Tracks authentic public exam documents to be ingested and verified across
 * genuine assessment authorities. Distinguishes authentic documents from synthetic
 * unit fixtures.
 */

export interface RealWorldAssessmentDocumentEntry {
  documentId: string;
  examAuthority: 'UPSC' | 'SSC' | 'GATE_IIT' | 'NTA_JEE' | 'NTA_NEET' | 'RAILWAY_RRB' | 'STATE_PSC' | 'UNIVERSITY';
  examTitle: string;
  sessionOrYear: string;
  paperCodeOrShift: string;
  officialSha256Fingerprint?: string;
  fileSizeBytes?: number;
  expectedPageCount: number;
  acquisitionSource: 'OFFICIAL_PORTAL' | 'PUBLIC_ARCHIVE' | 'CANDIDATE_RESPONSE_SHEET';
  publicDomainOrFairUseNotes: string;
  physicalChallengesPresent: {
    multiColumnLayout: boolean;
    tcsAnswerSheetLattice: boolean;
    displayAndInlineMath: boolean;
    vectorDiagrams: boolean;
    rasterCroppedOptions: boolean;
    complexTabularGrids: boolean;
    rotatedPagesOrText: boolean;
    customCMapFonts: boolean;
    scannedFullPageBitmaps: boolean;
    watermarkArtifacts: boolean;
  };
  ingestionStatus: 'PENDING_ACQUISITION' | 'ACQUIRED_UNVERIFIED' | 'PHYSICALLY_VERIFIED' | 'ACQUISITION_FAILED';
}

export class RealWorldGoldenCorpusRegistry {
  private static readonly ENTRIES: RealWorldAssessmentDocumentEntry[] = [
    {
      documentId: 'REAL-UPSC-CSE-PRELIMS-2023-GS1',
      examAuthority: 'UPSC',
      examTitle: 'Civil Services Examination (Preliminary) - General Studies Paper I',
      sessionOrYear: '2023',
      paperCodeOrShift: 'Set A',
      officialSha256Fingerprint: '14281f205282431f668c23ba0f79952b500255d81f7d4a9ea2b27c84cf99e7e2',
      fileSizeBytes: 6947922,
      expectedPageCount: 48,
      acquisitionSource: 'OFFICIAL_PORTAL',
      publicDomainOrFairUseNotes: 'Official public release: https://www.upsc.gov.in/sites/default/files/QP_CS_Pre_Exam_2023_280523.pdf',
      physicalChallengesPresent: {
        multiColumnLayout: true,
        tcsAnswerSheetLattice: false,
        displayAndInlineMath: false,
        vectorDiagrams: false,
        rasterCroppedOptions: false,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: true,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: true,
      },
      ingestionStatus: 'PHYSICALLY_VERIFIED',
    },
    {
      documentId: 'REAL-SSC-CHSL-2023-TIER1-02AUG-S2',
      examAuthority: 'SSC',
      examTitle: 'Combined Higher Secondary Level (CHSL) Tier-1 Examination',
      sessionOrYear: '2023',
      paperCodeOrShift: '02 Aug 2023 Shift 2 (11:45 AM - 12:45 PM)',
      officialSha256Fingerprint: '79911f24f2ca34382b976019013901ec4678c6c07cd1fef3b84e277377dde7ac',
      fileSizeBytes: 1573058,
      expectedPageCount: 33,
      acquisitionSource: 'CANDIDATE_RESPONSE_SHEET',
      publicDomainOrFairUseNotes: 'Official TCS iON candidate assessment response sheet',
      physicalChallengesPresent: {
        multiColumnLayout: false,
        tcsAnswerSheetLattice: true,
        displayAndInlineMath: true,
        vectorDiagrams: false,
        rasterCroppedOptions: true,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: false,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: true,
      },
      ingestionStatus: 'PHYSICALLY_VERIFIED',
    },
    {
      documentId: 'REAL-GATE-2024-CSIT',
      examAuthority: 'GATE_IIT',
      examTitle: 'Graduate Aptitude Test in Engineering - Computer Science & Information Technology',
      sessionOrYear: '2024',
      paperCodeOrShift: 'CS Session 1',
      officialSha256Fingerprint: '18cf9ac15c01bdbf9d767c7a402d63234a28ae91c8ec227090ba5a5fdef121dd',
      fileSizeBytes: 834514,
      expectedPageCount: 36,
      acquisitionSource: 'OFFICIAL_PORTAL',
      publicDomainOrFairUseNotes: 'Official question paper released by IISc Bangalore / GATE Organizing Committee',
      physicalChallengesPresent: {
        multiColumnLayout: false,
        tcsAnswerSheetLattice: false,
        displayAndInlineMath: true,
        vectorDiagrams: true,
        rasterCroppedOptions: true,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: true,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: false,
      },
      ingestionStatus: 'PHYSICALLY_VERIFIED',
    },
    {
      documentId: 'REAL-JEE-ADVANCED-2023-PAPER1',
      examAuthority: 'NTA_JEE',
      examTitle: 'Joint Entrance Examination (Advanced) - Paper 1 (Physics, Chemistry, Mathematics)',
      sessionOrYear: '2023',
      paperCodeOrShift: 'Paper 1',
      officialSha256Fingerprint: '7823ad451ebd269ffc1dcb36e2c29f2dff506a50a4a0f663f98b99864fa955be',
      fileSizeBytes: 2570592,
      expectedPageCount: 30,
      acquisitionSource: 'OFFICIAL_PORTAL',
      publicDomainOrFairUseNotes: 'Official public release: https://jeeadv.ac.in/past_qps/2023_1_English.pdf',
      physicalChallengesPresent: {
        multiColumnLayout: false,
        tcsAnswerSheetLattice: false,
        displayAndInlineMath: true,
        vectorDiagrams: true,
        rasterCroppedOptions: true,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: true,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: false,
      },
      ingestionStatus: 'PHYSICALLY_VERIFIED',
    },
    {
      documentId: 'REAL-NEET-UG-2023-CODE-E1',
      examAuthority: 'NTA_NEET',
      examTitle: 'National Eligibility cum Entrance Test (UG)',
      sessionOrYear: '2023',
      paperCodeOrShift: 'Code E1',
      expectedPageCount: 48,
      acquisitionSource: 'OFFICIAL_PORTAL',
      publicDomainOrFairUseNotes: 'ACQUISITION_FAILED: National Testing Agency does not host authentic question paper booklets on an unauthenticated open public URL (administered physically via paper OMR).',
      physicalChallengesPresent: {
        multiColumnLayout: true,
        tcsAnswerSheetLattice: false,
        displayAndInlineMath: true,
        vectorDiagrams: true,
        rasterCroppedOptions: true,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: true,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: false,
      },
      ingestionStatus: 'ACQUISITION_FAILED',
    },
    {
      documentId: 'REAL-RRB-NTPC-CBT2-2022',
      examAuthority: 'RAILWAY_RRB',
      examTitle: 'Railway Recruitment Board NTPC Stage 2 Examination',
      sessionOrYear: '2022',
      paperCodeOrShift: 'Level 6 Shift 1',
      expectedPageCount: 30,
      acquisitionSource: 'CANDIDATE_RESPONSE_SHEET',
      publicDomainOrFairUseNotes: 'ACQUISITION_FAILED: Railway Recruitment Board candidate response sheets are hosted exclusively behind candidate login on TCS iON portals and are unavailable without credentials.',
      physicalChallengesPresent: {
        multiColumnLayout: false,
        tcsAnswerSheetLattice: true,
        displayAndInlineMath: false,
        vectorDiagrams: false,
        rasterCroppedOptions: true,
        complexTabularGrids: true,
        rotatedPagesOrText: false,
        customCMapFonts: false,
        scannedFullPageBitmaps: false,
        watermarkArtifacts: true,
      },
      ingestionStatus: 'ACQUISITION_FAILED',
    },
  ];

  static getAllRegisteredDocuments(): RealWorldAssessmentDocumentEntry[] {
    return [...this.ENTRIES];
  }

  static getDocumentById(documentId: string): RealWorldAssessmentDocumentEntry | undefined {
    return this.ENTRIES.find((e) => e.documentId === documentId);
  }

  static getDocumentsByAuthority(authority: RealWorldAssessmentDocumentEntry['examAuthority']): RealWorldAssessmentDocumentEntry[] {
    return this.ENTRIES.filter((e) => e.examAuthority === authority);
  }
}
