# UADUE Phase 2D — Cryptographic Provenance & Audit Trail Contract
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 2.0.0-CONTRACT-CORRECTED
**Classification:** Stage A Design Specification — Cryptographic Hash Chaining & Auditability
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Pending)**

---

## 1. Cryptographic Provenance Charter

In UADUE, no piece of pedagogical data exists without a **tamper-proof, cryptographically sealed lineage** tracing back to raw source bytes.

Phase 2D introduces **6-Tier Cryptographic Hash Chaining**:

$$\begin{matrix}
\text{[Layer 0]} & \mathbf{H_0} = \operatorname{Sha256}(\text{Raw Source PDF Bytes}) \\
& \big\downarrow \\
\text{[Layer 1]} & \mathbf{H_1} = \operatorname{Sha256}(\mathbf{H_0} \parallel \text{ForensicSnapshot Geometry AST}) \\
& \big\downarrow \\
\text{[Layer 2]} & \mathbf{H_2} = \operatorname{Sha256}(\mathbf{H_1} \parallel \text{Physical DocumentGraph Nodes \& Edges}) \\
& \big\downarrow \\
\text{[Layer 3]} & \mathbf{H_3} = \operatorname{Sha256}(\mathbf{H_2} \parallel \text{QuestionCandidates} \parallel \text{RelationshipCandidates}) \\
& \big\downarrow \\
\text{[Layer 4]} & \mathbf{H_4} = \operatorname{Sha256}(\mathbf{H_3} \parallel \text{LogicalQuestionFamilies} \parallel \text{DiscrepancyLedger}) \\
& \big\downarrow \\
\text{[Layer 5]} & \mathbf{H_5} = \operatorname{Sha256}(\mathbf{H_4} \parallel \text{CanonicalQuestionIR Content Blocks \& Assets})
\end{matrix}$$

---

## 2. Provenance Data Structures & Schemas

```typescript
import { BoundingBox2D } from './evidence';

export interface AuditActionEntry {
  actionId: string;              // Deterministic hash of action + timestamp + operator
  actionType:
    | 'PARSER_SYNTHESIS'
    | 'MULTILINGUAL_UNIFICATION'
    | 'DISCREPANCY_FLAGGED'
    | 'MODERATOR_OVERRIDE'
    | 'ANSWER_KEY_BINDING'
    | 'MTA_INVALIDATION';
  fieldModified?: string;
  previousValue?: unknown;
  newValue?: unknown;
  rationale: string;
  operator: 'DETERMINISTIC_ENGINE' | 'STAFF_MODERATOR' | 'COMMUNITY_REVIEW';
  operatorId?: string;
  timestamp: number;
  digitalSignature?: string;
}

export interface ProvenanceChainVector {
  sourceSha256: string;          // Layer 0: Raw PDF file hash
  snapshotSha256: string;        // Layer 1: Forensic snapshot hash
  documentGraphSha256: string;   // Layer 2: Physical document graph hash
  questionGraphSha256: string;   // Layer 3: QuestionGraph sealed hash
  familySynthesisSha256: string; // Layer 4: Logical family synthesis hash
  canonicalQuestionSha256: string;// Layer 5: Canonical question IR hash
  chainVerified: boolean;
}

export interface CanonicalProvenanceRecord {
  provenanceId: string;
  chain: ProvenanceChainVector;
  sourceFileName: string;
  sourcePageNumbers: number[];
  boundingHulls: Record<string, BoundingBox2D>; // Per-script bounding box on paper
  adapterInfo: {
    adapterId: string;
    adapterVersion: string;
    parserVersion: string;
    schemaVersion: string;
    runtimeEnvironment: string;
  };
  auditTrail: AuditActionEntry[];
  sealedAt: number;
}
```

---

## 3. Deterministic Replay & Verification Invariant

Phase 2D specifies **100% Deterministic Reproducibility**:

### Invariant: Deterministic Replay [DESIGN-SPECIFIED]
$$\forall \mathcal{G}_3, \text{ if } \mathcal{T}_{2D}(\mathcal{G}_3) = \mathcal{C}_5^{(1)} \quad \text{and} \quad \mathcal{T}_{2D}(\mathcal{G}_3) = \mathcal{C}_5^{(2)} \implies \operatorname{Sha256}(\mathcal{C}_5^{(1)}) \equiv \operatorname{Sha256}(\mathcal{C}_5^{(2)})$$

- **Deterministic Sorting:** Sets, maps, and dictionaries are sorted by canonical deterministic keys prior to serialization and hashing.
- **Floating Point Precision:** Geometric bounding boxes are serialized using IEEE-754 64-bit double precision with fixed 4-decimal-place rounding (`0.0001` pt precision) to eliminate cross-platform float divergence.
- **Audit Immutability:** Any manual correction or staff patch appends a signed `AuditActionEntry` with an incremented `revisionNumber` and new `contentAstHash` without altering previous cryptographic lineage.
