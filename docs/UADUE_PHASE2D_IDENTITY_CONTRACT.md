# UADUE Phase 2D — Question Identity & Representation Contract
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 3.0.0-TOPOLOGY-HARDENED
**Classification:** Stage A Design Specification — Multi-Dimensional Identity Model
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Locked)**

---

## 1. Multi-Dimensional Identity Architecture

The core tenet of UADUE identity is that **a physical block on paper is not identical to a pedagogical question, nor is it identical to a runtime assessment item**.

To prevent conceptual collapse, Phase 2D formalizes a **5-Layer Decoupled Identity Model**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension A: Source Question Instance Identity (Physical Source Reality)              │
│   - Immutable representation of ink/pixels on a physical page.                         │
│   - Deterministic hash: SHA256(sourceDocId + pageNumber + sequenceIndex + bboxHash)     │
│   - Contains explicit candidateFamilyMembership[] vector.                              │
│   - Status: Phase 2C Verified                                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension B1: Logical Question Family Identity (Relational Multi-Script Unit)          │
│   - Groups 1 or more directly verified homologous physical instances.                  │
│   - Deterministic hash: SHA256(Sorted [InstanceIds] + DirectRelationIds)               │
│   - Status: [DESIGN-SPECIFIED]                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension B2: Canonical Question Family Identity (Pedagogical Assessment Unit)         │
│   - Cross-variant canonical identity across exam shifts, booklets, or test series.     │
│   - Deterministic hash: SHA256(OfficialAuthorityId || NormalizedContentFingerprint)    │
│   - Status: [DESIGN-SPECIFIED]                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension C: Content Revision Identity (Versioned AST State)                           │
│   - Versioned content tree; increments on OCR corrections or typographical fixes.      │
│   - Deterministic hash: SHA256(ContentAstHash + RevisionNumber + AuthorId)             │
│   - Status: [DESIGN-SPECIFIED]                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension D: Extraction Revision Identity (Algorithmic Provenance)                     │
│   - Identifies the specific parser version, adapter profile, and execution run.        │
│   - Deterministic hash: SHA256(AdapterId + AdapterVer + ParserVer + ProfileVer)        │
│   - Status: [DESIGN-SPECIFIED]                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Dimension E: Assessment Instance Identity (Runtime Test Delivery)                      │
│   - Runtime item in an active candidate test session.                                  │
│   - Deterministic hash: SHA256(SessionId + CanonicalQuestionId + DisplaySequenceIndex) │
│   - Status: [DESIGN-SPECIFIED]                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Formal Identity Interfaces & Schema Specifications

```typescript
/**
 * Explicit Candidate Family Membership Declaration [DESIGN-SPECIFIED]
 */
export interface CandidateFamilyMembership {
  familyId: string;
  relationshipId: string;
  relationshipType: 'SAME_LOGICAL_QUESTION' | 'LANGUAGE_REPRESENTATION_OF';
  verificationState: 'VERIFIED' | 'REVIEW_REQUIRED' | 'PROVISIONAL';
  roleInFamily: 'PRIMARY_REFERENCE' | 'LANGUAGE_VARIANT' | 'CANONICAL_EQUIVALENT';
  supportingRelationships: string[]; // IDs of direct verified relationship edges
  conflictingRelationships: string[]; // IDs of flagged conflicting edges
  provenance: {
    sourceSnapshotId: string;
    evaluatedAt: number;
    algorithmId: string;
    algorithmVersion: string;
  };
}

/**
 * Dimension A: Immutable Physical Source Question Instance [Phase 2C FROZEN]
 */
export interface SourceQuestionInstanceIdentity {
  instanceId: string;           // Deterministic 64-char hex hash
  sourceDocumentId: string;     // Unique document identifier (e.g. 'doc_upsc_2023_gs1')
  sourceVariantId?: string;     // Booklet / Shift / Set code (e.g. 'SET_A', 'SHIFT_2')
  sourcePageNumber: number;     // Physical page number (1-indexed)
  sourceSequenceIndex: number;  // Visual reading-order sequence index on page
  sourcePrintedLabel?: string;  // Exact printed label (e.g. "Q. 15", "15(a)", "१६.")
  sourceBboxHash: string;       // Spatial hash of bounding hull coordinates
  familyMemberships: CandidateFamilyMembership[]; // Explicit membership vector
}

/**
 * Dimension B1: Logical Question Family [DESIGN-SPECIFIED]
 */
export interface LogicalQuestionFamilyIdentity {
  familyId: string;             // Deterministic hash of grouped physical instances
  sourceDocumentId: string;     // Master source document ID
  physicalInstanceIds: string[];// All underlying physical QuestionCandidate IDs (1 or more)
  primaryLanguageScript: string;// Default / reference script ('LATIN', 'DEVANAGARI', etc.)
  supportedScripts: string[];   // All available scripts in this family
  hasBilingualSpread: boolean;  // True if across facing pages (Verso-Recto)
}

/**
 * Dimension B2: Canonical Question Family [DESIGN-SPECIFIED]
 */
export interface CanonicalQuestionFamilyIdentity {
  canonicalId: string;          // Universal cross-variant canonical question ID
  officialAuthorityQuestionId?: string; // e.g. TCS Master Question ID '1042948291'
  officialSectionCode?: string; // e.g. 'GI_REASONING', 'QUANT_TIER1'
  isAuthorityCertified: boolean;
  contentFingerprint: string;   // Normalized semantic content hash
  structuralFingerprint: string;// Layout & topology fingerprint
  assetFingerprint: string;     // Hash of associated visual/diagram assets
}

/**
 * Dimension C: Content Revision State [DESIGN-SPECIFIED]
 */
export interface ContentRevisionIdentity {
  revisionId: string;           // Content AST hash + revision number
  parentRevisionId?: string;    // Previous revision ID for lineage
  revisionNumber: number;       // Monotonically increasing integer (1, 2, 3...)
  contentAstHash: string;       // SHA-256 of the normalized ContentBlock AST
  createdAt: number;            // Timestamp in milliseconds
  authorType: 'DETERMINISTIC_PARSER' | 'STAFF_PATCH' | 'COMMUNITY_REVIEW';
  authorId?: string;            // ID of operator or automated agent
  changeSummary?: string;       // Description of modification
}

/**
 * Dimension D: Extraction Run Provenance [DESIGN-SPECIFIED]
 */
export interface ExtractionRevisionIdentity {
  runId: string;                // Algorithmic execution identifier
  adapterId: string;            // e.g. 'uadue_pdf_reference_adapter'
  adapterVersion: string;       // Semantic version '2.4.0'
  parserVersion: string;        // Semantic version '2.4.0'
  assessmentProfileId: string;  // e.g. 'upsc_civil_services_prelims'
  assessmentProfileVersion: string;
  executionTimestamp: number;
}

/**
 * Dimension E: Runtime Test Delivery Instance [DESIGN-SPECIFIED]
 */
export interface AssessmentInstanceIdentity {
  sessionItemId: string;        // Candidate exam session item ID
  examSessionId: string;        // Active test session ID
  sectionKey: string;           // Assigned test section
  displaySequenceIndex: number; // Candidate's randomized sequence position
}
```

---

## 3. Fingerprint Algorithms & Deterministic Hashing

### 3.1 Structural Fingerprint
$$\text{FP}_{\text{struct}} = \operatorname{Hash}\left(\text{Topology} \parallel |\text{Options}| \parallel \text{HasMath} \parallel \text{HasDiagram} \parallel \text{HasTable}\right)$$

### 3.2 Content Fingerprint
$$\text{FP}_{\text{content}} = \operatorname{Hash}\left(\operatorname{Normalize}(\text{StemText}) \parallel \operatorname{Sort}\left(\{\operatorname{Normalize}(\text{Opt}_i)\}\right)\right)$$

### 3.3 Asset Fingerprint
$$\text{FP}_{\text{asset}} = \operatorname{Hash}\left(\operatorname{Sort}\left(\{\operatorname{Sha256}(\text{Asset}_j)\}\right)\right)$$
