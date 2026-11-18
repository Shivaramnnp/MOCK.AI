# UADUE Phase 2C — Provenance & Cryptographic Traceability Audit

**Document Reference:** `UADUE_PHASE2C_PROVENANCE_AUDIT`  
**Execution Timestamp:** 2026-10-07T12:30:00.000Z  
**Engine Layer:** Layer 3 (QuestionGraph Provenance & Sealing)  
**Provenance Verification:** 🟢 **100% CRYPTOGRAPHICALLY TRACEABLE**  
**Phase 2D Status:** 🔴 **STRICTLY BLOCKED**

---

## 1. End-to-End Provenance Architecture

In UADUE, every higher-layer data structure maintains an unbroken cryptographic and spatial pointer chain back to the raw source PDF bytes. 

```
Raw PDF Bytes (SHA-256)
      │
      ▼
ForensicSnapshot (Layer 1)
      │ sourceSnapshotId, sourceSha256
      ▼
DocumentGraph (Layer 2)
      │ sourceDocumentGraphId, sourceDocumentGraphSha256
      ▼
Partition QuestionGraph (Layer 3 Partition Spec)
      │ partitionId, [startPage, endPage], partitionSha256
      ▼
Merged Unified QuestionGraph (Layer 3 Merged)
      │ graphId, sealedHash, determinismScope
      ▼
QuestionCandidate / OptionCandidate / RelationshipCandidate
      │ physicalInstanceId, numberNodeId, optionCandidateIds, evidence[].sourceNodeIds
```

---

## 2. Partition Provenance Records

When the `PartitionOrchestrator` executes and merges partitions:
1. Each partition produces a sealed `QuestionGraph` containing:
   - `sourceDocumentId`
   - `sourceSha256`
   - `sourceDocumentGraphId`
   - `algorithmVersion` & `configurationVersion`
2. The merged graph consolidates all partition sub-graphs and generates an authoritative merged `provenance` record:
   - `algorithmId: 'uadue_partitioned_orchestrator'`
   - `algorithmVersion: '1.0.0'`
   - `sourceSha256: <original_document_sha256>`
   - `createdAt: <firstGraph.provenance.createdAt>` (ensuring deterministic bitwise replay)
   - `determinismScope: { identicalDocumentGraph: true, identicalAlgorithm: true, identicalConfig: true, runtime: 'Node.js', floatPrecision: 'IEEE_754_64BIT' }`

---

## 3. Relationship Evidence Traceability

Every relationship generated across partitions (such as `LANGUAGE_REPRESENTATION_OF`) contains a complete array of `RelationshipEvidence` objects with explicit `sourceNodeIds`:

```json
{
  "evidenceId": "ev_facing_2_3",
  "evidenceType": "FACING_PAGE_SPREAD_PAIR",
  "evidenceStrength": "HARD",
  "sourceNodeIds": ["node_p2_text_1", "node_p3_text_1"],
  "description": "Cross-batch facing page spread: Verso page 2 faces Recto page 3",
  "confidence": 0.99
}
```

This guarantees that:
1. No relationship is formed based on unverified inference or model guessing.
2. Every link points directly to the underlying physical `DocumentGraphNode`s in the raw document layout.
3. Logical canonical unification can be audited and reconstructed deterministically in future Phase 2D layers without data loss.

---

## 4. Determinism Audit Verdict
- All candidate IDs, option IDs, relationship IDs, and merged graph hashes are deterministic functions of the raw document content and algorithm parameters.
- Re-running the pipeline from memory or cache produces identical hash outputs with **zero recomputation drift**.
