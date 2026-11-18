# UADUE Phase 2D — Question Relationship Semantics & Topology Hardening
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 3.0.0-TOPOLOGY-HARDENED
**Classification:** Stage A Design Specification — Formal Relational Semantics & Family Membership
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Locked)**

---

## 1. Executive Summary & Topology Hardening Charter

This document establishes the **hardened mathematical semantics of relationships and logical family construction** for Phase 2D.

### Core Architectural Mandates:
1. **Graph Connected Components $\ne$ Logical Question Families:** A graph connected component is merely topological evidence. A `LogicalQuestionFamily` is an **explicitly evaluated, rule-governed derived object**.
2. **Explicit Candidate Family Membership Vector:** Every `QuestionCandidate` must declare its explicit `candidateFamilyMembership[]` containing verification state, relationship evidence, supporting relationships, and conflicting relationships.
3. **Rigorous Transitivity Boundaries:** Transitivity is formally evaluated per relationship type ($R(A,B) \land R(B,C) \implies R(A,C)$). Broad or naive transitivity is strictly prohibited.
4. **Versioned Continuation Lineage:** `CONTINUATION_OF` transitions from a static "irreversible once sealed" model to a **versioned relationship model** preserving immutable historical snapshots and cryptographic audit trails.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        LOGICAL FAMILY EVALUATION PIPELINE                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                Physical Candidates
                                         │
                                         ▼
                      Evidence-Backed Relationship Candidates
                                         │
                                         ▼
                        Family Membership Evaluation Rule
                  (Script Disjointness + Direct Pairwise Proofs)
                                         │
                                         ▼
                         Explicit CandidateFamilyMembership
                                         │
                                         ▼
                               Logical Question Family
```

---

## 2. Exhaustive Relationship Classification & Algebraic Properties

The table below defines the formal algebraic properties, family-creation authorization, candidate-merging rules, and canonical equivalence implications for all 9 relationship types:

| Relationship Type | Directionality | Symmetry | Transitivity ($R(A,B) \land R(B,C) \implies R(A,C)$) | Can Create Family? | Can Merge Physical Nodes? | Implies Canonical Equivalence? |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: |
| `SAME_LOGICAL_QUESTION` | Bidirectional | **SYMMETRIC** | **TRANSITIVE IF AND ONLY IF** $\operatorname{Variant}(A) \equiv \operatorname{Variant}(B) \equiv \operatorname{Variant}(C) \land \operatorname{OfficialId}(A) \equiv \operatorname{OfficialId}(B) \equiv \operatorname{OfficialId}(C)$. Otherwise **NON-TRANSITIVE**. | **YES** | **NO** | **YES** |
| `LANGUAGE_REPRESENTATION_OF` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. $A \leftrightarrow B \land B \leftrightarrow C \not\implies A \leftrightarrow C$. (See Theorem 1). | **YES** | **NO** | **YES** (Multi-Script) |
| `VARIANT_OF` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Parameter variations form distinct items ($A \sim_{\text{var}} B \land B \sim_{\text{var}} C \not\implies A \sim_{\text{var}} C$). | **NO** | **NO** | **NO** (Distinct Canonical Questions) |
| `CONTINUATION_OF` | Unidirectional ($A \to B$) | **ASYMMETRIC** | **TRANSITIVE IF AND ONLY IF** Directed sequence chain is topologically acyclic and pages/reading order are strictly monotonic: $\operatorname{Page}(A) \le \operatorname{Page}(B) \le \operatorname{Page}(C) \land \operatorname{Seq}(A) < \operatorname{Seq}(B) < \operatorname{Seq}(C)$. Otherwise **NON-TRANSITIVE**. | **NO** | **YES** (Merges physical node sets) | **NO** (Forms 1 physical candidate) |
| `SHARED_STIMULUS_CHILD_OF` | Unidirectional ($Q \to S$) | **ASYMMETRIC** | **NON-TRANSITIVE**. Two child questions $Q_1, Q_2$ sharing stimulus $S$ does NOT make $Q_1 \sim Q_2$. | **NO** | **NO** | **NO** (Distinct Child Questions) |
| `POSSIBLE_DUPLICATE_CANDIDATE` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Suspected duplicates require manual review; never transitively merged. | **NO** | **NO** | **NO** |
| `REVISED_KEY_FOR` | Unidirectional ($K \to Q$) | **ASYMMETRIC** | **NON-TRANSITIVE**. Key revision applies strictly to target question IR. | **NO** | **NO** | **NO** (Answer Overlay) |
| `RELATED_BUT_DISTINCT` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Proximity or theme overlap does not propagate. | **NO** | **NO** | **NO** (Isolated Families) |
| `UNKNOWN_RELATIONSHIP` | Unidirectional | **ASYMMETRIC** | **NON-TRANSITIVE**. Unverified relation; no propagation. | **NO** | **NO** | **NO** |

---

## 3. Mathematical Proofs & Transitivity Restrictions

### 3.1 Theorem 1: Non-Transitivity of Multilingual Representation
$$\text{Let } \mathcal{R} = \text{LANGUAGE\_REPRESENTATION\_OF}.$$
$$\mathcal{R}(A, B) \land \mathcal{R}(B, C) \not\implies \mathcal{R}(A, C)$$

#### Proof by Real-World Counterexample (The English-Hindi-English Triangle):
1. Let $A$ be an English question on Page 2 (Question 1: "What is GDP?").
2. Let $B$ be a Hindi question on Page 3 (Question 1: "जीडीपी क्या है?").
3. Let $C$ be an unrelated English question on Page 4 (Question 5: "What is Inflation?").
4. Suppose through a faulty heuristic or OCR overlap, edge $\mathcal{R}(B, C)$ is proposed and claimed as plausible.
5. $\operatorname{Script}(A) = \text{LATIN}, \operatorname{Script}(B) = \text{DEVANAGARI}, \operatorname{Script}(C) = \text{LATIN}$.
6. Both pairs $(A, B)$ and $(B, C)$ satisfy cross-script distinctness ($\text{LATIN} \ne \text{DEVANAGARI}$).
7. However, $\operatorname{Script}(A) \equiv \operatorname{Script}(C) \equiv \text{LATIN}$.
8. If transitivity were permitted, $A$ (GDP) and $C$ (Inflation) would be declared identical questions under the same family.
9. Therefore, $\mathcal{R}$ is strictly **NON-TRANSITIVE**.

$$\mathbf{Formal\ Invariant}: \quad \text{Every pairwise edge in a multilingual family must be independently verified by direct evidence } E_{\text{hard}} \ge 2.$$

### 3.2 Theorem 2: Non-Equivalence of Graph Connected Components and Logical Families
$$\text{ConnectedComponent}(\mathcal{G}_{\text{relationships}}) \not\equiv \text{LogicalQuestionFamily}$$

#### Formal Proof:
Let $\mathcal{G} = (V, E)$ be the relationship candidate graph where vertices $V$ are `QuestionCandidate` nodes and edges $E$ are verified relationship candidates.
- Suppose $A, B \in V$ with edge $e_1 = (A, B, \text{SAME\_LOGICAL\_QUESTION})$.
- Suppose $B, C \in V$ with edge $e_2 = (B, C, \text{VARIANT\_OF})$.
- The graph connected component containing $A, B, C$ is $\{A, B, C\}$.
- However, $A$ and $C$ are variants, which by definition MUST NOT be collapsed into the same `LogicalQuestionFamily`.
- Equating connected components with question families results in corrupted question clustering.
- Therefore, **a LogicalQuestionFamily must be constructed via explicit membership evaluation, not naive connected-component traversal**.

---

## 4. Formal Candidate Family Membership Vector

To ensure complete transparency and prevent accidental graph collapse, every `QuestionCandidate` maintains an explicit `candidateFamilyMembership[]` structure:

```typescript
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

export interface QuestionCandidate {
  candidateId: string;
  physicalInstanceId: string;
  sourceQuestionNumber?: string;
  // ... physical properties ...
  candidateFamilyMembership: CandidateFamilyMembership[];
}
```

### 4.1 Family Synthesis Invariants
A candidate $q_i$ enters a `LogicalQuestionFamily` $\mathcal{F}$ IF AND ONLY IF:
1. **Direct Pairwise Verification:** For every other candidate $q_j \in \mathcal{F}$, there exists a direct, verified relationship edge $e = (q_i, q_j)$ with $\operatorname{status}(e) == \text{'RELATIONSHIP\_PROVEN'}$.
2. **Script Disjointness:** $\forall q_j \in \mathcal{F}\setminus\{q_i\},\ \operatorname{Script}(q_i) \ne \operatorname{Script}(q_j)$.
3. **Zero Conflicting Edges:** There exists no conflicting relationship edge ($e_{\text{conf}} \in \text{ConflictingRelationships}$) between $q_i$ and any member of $\mathcal{F}$.
4. **Explicit Membership Declaration:** An entry is appended to $q_i.\text{candidateFamilyMembership}$ detailing the exact evidentiary justification.

---

## 5. Versioned CONTINUATION_OF Lifecycle Model

The previous static specification ("irreversible once sealed") is formally replaced with a **Versioned Continuation Lifecycle**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        VERSIONED CONTINUATION LIFECYCLE                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [Candidate / Review State] (MUTABLE)
    ├── Continuous inspection of reading-order DAG
    ├── Candidate split edges may be proposed, adjusted, or rejected by moderator
    └── Version ID: v0.1-DRAFT

  [Sealed Artifact Version] (IMMUTABLE)
    ├── Cryptographically sealed with SHA-256 digest
    ├── Canonical IR locked for test delivery
    └── Version ID: v1.0-SEALED (Immutable Snapshot)

  [Post-Sealing Correction Flow] (VERSIONED PATCH)
    ├── Step 1: Retain historical sealed snapshot v1.0-SEALED unaltered in audit store
    ├── Step 2: Create new RelationshipVersion (v2.0-CORRECTED)
    ├── Step 3: Record explicit AuditActionEntry with operatorId, timestamp, and rationale
    └── Step 4: Re-seal new CanonicalQuestionIR with incremented ContentRevisionIdentity
```

---

## 6. Exhaustive Adversarial Test Scenarios

### Adversarial Case A: The English-Hindi-English Triangle
- **Given:** English Candidate A, Hindi Candidate B, English Candidate C.
- **Observed:** Edge $(A, B)$ is verified `LANGUAGE_REPRESENTATION_OF`; Edge $(B, C)$ is verified `LANGUAGE_REPRESENTATION_OF`; Edge $(A, C)$ has NO direct proof.
- **Evaluation:**
  - $A$ and $B$ share Family $\mathcal{F}_1$ because direct edge $(A, B)$ is proven and $\operatorname{Script}(A) \ne \operatorname{Script}(B)$.
  - $B$ cannot enter Family $\mathcal{F}_2$ with $C$ simultaneously if it creates a multi-parent conflict.
  - $A$ and $C$ MUST NOT be unified into the same family.
- **Result:** Transitive collapse prevented. Error logged as `AMBIGUOUS_MULTI_REPRESENTATION`.

### Adversarial Case B: SAME_LOGICAL_QUESTION + VARIANT_OF Chain
- **Given:** Candidate A, Candidate B, Candidate C.
- **Observed:** $(A, B) = \text{SAME\_LOGICAL\_QUESTION}$; $(B, C) = \text{VARIANT\_OF}$.
- **Evaluation:** `VARIANT_OF` is strictly non-transitive and does NOT create family equivalence.
- **Result:** $A$ and $B$ form Family $\mathcal{F}_A$; $C$ forms distinct Family $\mathcal{F}_C$. $C$ links to $\mathcal{F}_A$ only as variant metadata.

### Adversarial Case C: SAME_LOGICAL_QUESTION + RELATED_BUT_DISTINCT Chain
- **Given:** Candidate A, Candidate B, Candidate C.
- **Observed:** $(A, B) = \text{SAME\_LOGICAL\_QUESTION}$; $(B, C) = \text{RELATED\_BUT\_DISTINCT}$.
- **Evaluation:** `RELATED_BUT_DISTINCT` is non-transitive and explicitly bars family creation.
- **Result:** $C$ is completely isolated into its own family $\mathcal{F}_C$.

### Adversarial Case D: Double Continuation Chain
- **Given:** Candidate A (Page 1 bottom), Candidate B (Page 2 top), Candidate C (Page 2 middle).
- **Observed:** $(A, B) = \text{CONTINUATION\_OF}$; $(B, C) = \text{CONTINUATION\_OF}$.
- **Evaluation:** Directed path $A \to B \to C$ is verified: $\operatorname{Page}(A)=1 \le \operatorname{Page}(B)=2 \le \operatorname{Page}(C)=2$ and sequence is strictly monotonic.
- **Result:** Transitive chain is valid. Physical node sets merged into single candidate $Q_{\text{merged}} = \operatorname{Nodes}(A) \cup \operatorname{Nodes}(B) \cup \operatorname{Nodes}(C)$.

### Adversarial Case E: Shared Stimulus Child Questions
- **Given:** Stimulus S, Child Candidate A, Child Candidate B.
- **Observed:** $(A, S) = \text{SHARED\_STIMULUS\_CHILD\_OF}$; $(B, S) = \text{SHARED\_STIMULUS\_CHILD\_OF}$.
- **Evaluation:** `SHARED_STIMULUS_CHILD_OF` is hierarchical (tree link) and non-transitive.
- **Result:** $A$ and $B$ both reference parent `stimulusId = S`, but remain completely separate, independent `LogicalQuestionFamily` entities.
