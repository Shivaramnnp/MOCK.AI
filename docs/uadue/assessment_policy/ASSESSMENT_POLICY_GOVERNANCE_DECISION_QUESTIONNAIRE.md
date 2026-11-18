# Mock.AI UADUE — Assessment-Policy Governance Decision Questionnaire (Purity Remediation R1)
**Document Identifier:** `MOCK-AI-UADUE-GOV-QUEST-001-R1`  
**Security Classification:** Restricted Governance Specification  
**Status:** Architecture Discovery Only — Zero Implementation / Zero Code / Zero Schemas  
**Gate Status:** Canonical Assessment-Policy Governance Gate (Purity Pass R1)  
**Implementation Lock:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Frozen Baselines:** Phase 2A–2D8 (🟢 Frozen & Certified), Phase 3.1–3.4 (🟢 Closed), Phase 3.5 (🟢 Certified — Raw Score Only / 🔒 Frozen), Phase 3.6 (🔒 Strictly Locked)  
**Date:** 2026-10-08

---

## Authority Level Classification Legend

`[FROZEN FACT]` Every statement tagged with this code represents an immutable invariant from upstream certified phases (Phase 2A–2D8, Phase 3.1–3.5).  
`[EXISTING CONTRACT]` Represents a binding TypeScript interface or sealed database schema established in the frozen repository baseline.  
`[PRODUCT DECISION REQUIRED]` A strategic, regulatory, business, or operational question that **only the Product Owner can authorize**.  
`[CANDIDATE OPTION]` An unapproved illustrative alternative presented for governance consideration. **Explicitly NOT selected**.  
`[ENGINEERING DECISION FUTURE]` A non-binding technical design parameter to be decided by implementers only after governance authorization.  
`[UNRESOLVED]` An active governance domain whose authority boundary is explicitly blocked pending decision.  
`[OUT OF SCOPE]` A concept or mechanism explicitly excluded from current and planned platform boundaries.

---

## Executive Notice for the Product Owner

`[FROZEN FACT]` The architectural specification of the Canonical Assessment-Policy Layer is complete and governance-ready (`UADUE-SPEC-CAP-001`, `UADUE-SPEC-AP-R4-CONSISTENCY-001`).  
`[FROZEN FACT]` Implementation remains **strictly locked** (`🔒`). Zero code, database tables, migrations, or algorithms will be generated.  
`[FROZEN FACT]` The architecture makes **zero assumptions** about specific examination formulas, statutory legal hierarchies, or default scoring behaviors.  
`[PRODUCT DECISION REQUIRED]` Before any implementation planning can occur, the Product Owner must review this questionnaire and provide explicit binding decisions.

```text
================================================================================
                         STANDING GOVERNANCE POSTURE
================================================================================
  - Frozen Baselines (Phase 2A–2D8, 3.1–3.5):   🟢 IMMUTABLE & PROTECTED [FROZEN FACT]
  - Canonical Assessment-Policy Architecture:    🟢 GOVERNANCE-READY      [FROZEN FACT]
  - Assessment-Policy Implementation:           🔒 STRICTLY LOCKED       [FROZEN FACT]
  - Phase 3.6 Result Projection Gateway:        🔒 STRICTLY LOCKED       [FROZEN FACT]
  - GOV-AP-006 Numerical Semantics:             🟢 RESOLVED (CONCEPTUAL) [FROZEN FACT]
  - GOV-AP-009 Policy Composition:              🟢 RESOLVED (ARCHITECT)  [FROZEN FACT]
  - GOV-AP-001, 002, 003, 004, 005, 010:        🟡 UNRESOLVED (BLOCKED)  [UNRESOLVED]
================================================================================
```

---

# PART 1 — Assessment Capability Scope

`[PRODUCT DECISION REQUIRED]` The Product Owner must determine which of the following 20 candidate assessment capabilities Mock.AI will support, who holds authority for each, and how conflicts are handled.

`[IMPORTANT]` Every capability below is stated in **strictly neutral terms**. No formulas, multipliers, denominators, or default treatments are assumed.

### Capability Scope Decision Matrix

| # | Assessment Capability | Neutral Functional Description | In Scope for Mock.AI? `[PRODUCT DECISION REQUIRED]` | Profile-Specific or Universal? `[PRODUCT DECISION REQUIRED]` | Authoritative Entity Class `[PRODUCT DECISION REQUIRED]` | Rule If No Authority Exists `[PRODUCT DECISION REQUIRED]` | Rule If Authorities Conflict `[PRODUCT DECISION REQUIRED]` |
|---|---|---|---|---|---|---|---|
| **1** | **Raw Score Aggregation** | Algebraic summation of item-level awarded marks $\sum m_i$ | `[FROZEN FACT]` In scope in Phase 3.5 | `[FROZEN FACT]` Universal across all delivery | `[FROZEN FACT]` Phase 2D-5 Item Evaluator | `[FROZEN FACT]` Strict sum of awarded marks | `[FROZEN FACT]` Evaluated by Phase 2D-5 key resolver |
| **2** | **Aggregate Paper Transformation** | Section weightings, composite sums, or component multipliers | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Fallback to Raw<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **3** | **Dropped-Item Transformation** | Modification of paper evaluation when items are formally dropped | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Zero marks<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **4** | **Bonus / Disposition Treatment** | Non-standard item disposition awarding marks regardless of candidate choice | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Respect Phase 2D-5<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **5** | **Negative Marking Transformation** | Mark reduction applied based on incorrect responses | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Zero penalty<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **6** | **Partial Marking Transformation** | Fractional marks awarded for partial item correctness | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Binary (0/Full)<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **7** | **Multi-Key Evaluation Transformation** | Resolution where multiple distinct options are declared correct | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Respect Phase 2D-5<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **8** | **Question Cancellation Transformation** | Exclusion of question items from evaluation domain | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Zero marks<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **9** | **Section-Wise Scoring Transformation** | Partitioning item marks into named sections with distinct totals | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Flat aggregate<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **10**| **Paper-Level Normalization** | Rescaling total paper marks to a designated reporting standard | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit (Raw only)<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **11**| **Multi-Session Equating Transformation**| Statistical equating across multiple test sessions | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit equating<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **12**| **Percentile Computation** | Relative rank position expressed as a percentage of cohort | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit percentile<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **13**| **Ordinal Rank Computation** | Integer position in ordered cohort score list | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit rank<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **14**| **Qualification / Eligibility Determination**| Determining whether candidate satisfies progression criteria | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit qualification<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **15**| **Cutoff Evaluation** | Evaluating candidate scores against minimum thresholds | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit cutoff<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **16**| **Result Classification** | Assigning categorical performance or administrative status | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Omit status<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **17**| **Tie-Breaking Transformation** | Resolving identical scores using ordered criteria | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Joint ranks<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **18**| **Merit-List Roster Generation** | Generating ordered institutional candidate roster | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Out of scope<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **19**| **Category / Reservation-Aware Evaluation**| Evaluating outcomes based on demographic rosters | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Blind to category<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |
| **20**| **Other Custom Transformations** | Psychometric IRT scaling or proprietary mock metrics | `[ ]` In Scope<br>`[ ]` Out of Scope<br>`[ ]` Deferred | `[ ]` Profile-Specific<br>`[ ]` Universal Default | `[ ]` Client Board<br>`[ ]` Platform Lead<br>`[ ]` Other | `[ ]` Reject operation<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Profile Hierarchy<br>`[ ]` Quarantine<br>`[ ]` Escalation |

---

# PART 2 — Exam Profile Scope

`[PRODUCT DECISION REQUIRED]` Mock.AI cannot assume all examinations share the same assessment policies. The Product Owner must explicitly declare which examination families are in scope for initial support.

`[IMPORTANT]` The exam names below are **candidate profiles only**. Zero external scoring formulas or statutory rules are assumed or inferred.

### Candidate Exam Profiles Table

| Candidate Profile Code | Examination Family Description | In Scope for Initial Release? `[PRODUCT DECISION REQUIRED]` | Required Capabilities (List # from Part 1) `[PRODUCT DECISION REQUIRED]` | Official Policy Source Document Required? `[PRODUCT DECISION REQUIRED]` | Sealed Cohort Data Required? `[PRODUCT DECISION REQUIRED]` | Unresolved Governance Questions `[UNRESOLVED]` |
|---|---|---|---|---|---|---|
| **CAND-GATE** | Graduate Aptitude Test in Engineering | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Multi-session vs single-session profile separation |
| **CAND-SSC-CHSL** | SSC Combined Higher Secondary Level | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Multi-shift equating source authority definition |
| **CAND-SSC-CGL** | SSC Combined Graduate Level | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Multi-tier progression cutoff authority definition |
| **CAND-SSC-MTS** | SSC Multi-Tasking Staff | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Sectional session clearing requirements |
| **CAND-UPSC-CSE** | UPSC Civil Services Examination | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Dropped item mark redistribution vs denominator |
| **CAND-JEE-MAIN** | NTA Joint Entrance Examination Main | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | NTA score percentile calculation ownership |
| **CAND-RRB-NTPC** | Railway Recruitment Board NTPC | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Cross-shift mean-standard deviation equating |
| **CAND-IBPS-PO** | Institute of Banking Personnel Selection PO | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Sectional time limit and sectional cutoff rules |
| **CAND-SBI-PO** | State Bank of India Probationary Officer | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | Descriptive paper evaluation integration |
| **CAND-ECET** | State Engineering Common Entrance Test | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Mandatory `[ ]` Optional | `[ ]` YES `[ ]` NO | State-specific qualification percentage rules |
| **CAND-INTERNAL**| Mock.AI Proprietary Mock Assessment | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Platform Internal | `[ ]` Synthetic OK | Platform academic lead authority definition |
| **CAND-OTHER** | Other Institutional Client Profiles | `[ ]` YES `[ ]` NO `[ ]` ROADMAP | `[PO DECISION]` | `[ ]` Client Specification | `[ ]` As Contracted | Client tenant isolation and custom AST scope |

---

# PART 3 — GOV-AP-001: Qualification & Eligibility Ownership

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

The Product Owner must resolve the following 9 governance questions to define whether Qualification belongs in the Assessment-Policy Layer or in a separate downstream service:

1. `[PRODUCT DECISION REQUIRED]` **Platform Capability Boundary:** Does Mock.AI merely calculate candidate scores, or must it determine pass/fail and qualification?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Mock.AI computes mathematical scores only. Qualification is strictly OUT OF SCOPE.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Mock.AI computes scores AND determines candidate qualification.
2. `[PRODUCT DECISION REQUIRED]` **Pass/Fail vs Competitive Qualification:** Does Mock.AI treat academic "Pass/Fail" (clearing an absolute threshold) differently from competitive "Qualification" (shortlisting for subsequent stages based on merit/cutoffs)?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, they are distinct architectural concepts.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, treated as identical binary eligibility flags.
3. `[PRODUCT DECISION REQUIRED]` **Policy Storage Boundary:** Should qualification rules be stored inside the Assessment-Policy AST, or within an independent Qualification Policy domain?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Inside Assessment-Policy AST (combining score transformation and qualification).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Separate Qualification Policy entity (insulating score math from eligibility rules).
4. `[PRODUCT DECISION REQUIRED]` **Authoritative Ownership:** Who holds the authority to establish qualifying thresholds?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Client Examination Board / Commission exclusively.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Mock.AI Academic Lead / Institutional Administrator.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Historical empirical benchmark model.
5. `[PRODUCT DECISION REQUIRED]` **Information Dependency:** Can qualification be determined from candidate scores alone, or does it require non-score attributes?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Scores alone are sufficient.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Non-score attributes are required.
6. `[PRODUCT DECISION REQUIRED]` **Demographic Attribute Participation:** Can qualification depend on candidate reservation category (SC/ST/OBC/EWS), age, gender, attempt count, or domicile?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, candidate demographic attributes participate in qualification.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, qualification remains strictly blind to demographics.
7. `[PRODUCT DECISION REQUIRED]` **Sectional Cutoffs:** Does qualification require sectional minimum thresholds (clearing cutoffs in each individual paper section)?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, sectional cutoffs are required.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, aggregate score thresholds only.
8. `[PRODUCT DECISION REQUIRED]` **Missing Cutoff Policy:** What must the platform do if scoring is complete, but official qualifying cutoffs are not yet released?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Emit score receipt with `qualificationStatus = PENDING_AUTHORITY`.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Quarantine the candidate attempt receipt until cutoffs are published.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Compute provisional qualification based on historical cutoffs with warning flags.
9. `[PRODUCT DECISION REQUIRED]` **Conflicting Cutoff Directives:** How are contradictions between published cutoff sources resolved?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Exam-profile precedence hierarchy resolves conflict.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Fail-closed to `AUTHORITY_CONTRADICTION` quarantine.

---

# PART 4 — GOV-AP-002: Ranking & Merit Ownership

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

The Product Owner must resolve the following 9 governance questions to define ranking ownership and protect read-only Phase 3.6:

1. `[PRODUCT DECISION REQUIRED]` **Ranking Requirement:** Should Mock.AI calculate candidate ranks?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, ranking is a required product capability.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, Mock.AI reports scores and percentiles only.
2. `[PRODUCT DECISION REQUIRED]` **Raw Ordinal vs Statutory Merit Roster:** Does Mock.AI compute raw ordinal ranking ($1, \dots, N$) or formal merit rosters with reservation categories?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Raw ordinal score ranking only.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Category-wise merit rosters with statutory quota allocation.
3. `[PRODUCT DECISION REQUIRED]` **Institutional Merit List Publication:** Is generating downloadable institutional merit lists in scope for Mock.AI?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, merit list generation is in scope.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, merit lists belong to client administrative portals outside UADUE.
4. `[PRODUCT DECISION REQUIRED]` **Architectural Ownership:** Does ranking belong inside the Canonical Assessment-Policy Engine or in an independent batch Ranking Service?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Inside Assessment-Policy Engine.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Independent batch Ranking Service (protecting Phase 3.6 as read-only).
5. `[PRODUCT DECISION REQUIRED]` **Cohort Completeness Dependency:** Does ranking require 100% complete cohort observations across all shifts before any candidate rank is emitted?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, requires sealed, complete cohort dataset across all shifts.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, provisional ranking based on currently submitted attempts is permitted.
6. `[PRODUCT DECISION REQUIRED]` **Tie-Breaking Method:** How are identical candidate scores broken?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Profile-specific tie-breaking rule chains (e.g. section marks $\to$ age $\to$ name).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Shared rank assigned (e.g. joint Rank 1, next is Rank 3).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Deterministic hash pseudo-random ordering.
7. `[PRODUCT DECISION REQUIRED]` **Tie-Breaking Authority:** Who defines and authorizes tie-breaking criteria?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Official examination authority brochure exclusively.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Mock.AI platform default tie-breaking policy.
8. `[PRODUCT DECISION REQUIRED]` **Demographic Participation in Ties:** Are candidate demographic attributes (age, gender, category) permitted to participate in tie-breaking?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, demographic tie-breaking is authorized.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: No, demographic attributes are strictly prohibited from scoring/ranking.
9. `[PRODUCT DECISION REQUIRED]` **Administrative Boundary:** Where does UADUE ranking end and administrative seat allotment begin?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: UADUE stops at score ranking; seat allocation is external.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: UADUE includes category seat allocation rosters.

---

# PART 5 — GOV-AP-003: Statutory Source Authority Model

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

`[IMPORTANT]` No source class, legal hierarchy, or issuer title is authoritative until the Product Owner explicitly authorizes it.

1. `[PRODUCT DECISION REQUIRED]` **Recognized Source Classes:** Which source document classes should Mock.AI recognize as valid authority?
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 1: Statutory / Legislative Publications (Acts, Ordinances, Gazettes).
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 2: Official Examination Notifications & Information Brochures.
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 3: Organizing Body Information Handouts & Official FAQs.
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 4: Official Public Corrigenda & Addenda.
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 5: Internal Mock.AI Academic Lead Specifications.
   - `[CANDIDATE OPTION — NOT SELECTED]` Class 6: Third-Party Client Contract Specifications.
2. `[PRODUCT DECISION REQUIRED]` **Authorized Issuing Entities:** Which entity roles can issue valid assessment policy specifications?
   - `[CANDIDATE OPTION — NOT SELECTED]` Role A: Statutory Government Commission Official.
   - `[CANDIDATE OPTION — NOT SELECTED]` Role B: University Dean of Examinations / Organizing Chairman.
   - `[CANDIDATE OPTION — NOT SELECTED]` Role C: Mock.AI Academic Review Board.
   - `[CANDIDATE OPTION — NOT SELECTED]` Role D: Client Institutional Administrator.
3. `[PRODUCT DECISION REQUIRED]` **Source Authenticity Establishment:** How is source document authenticity verified before translation into policy AST?
   - `[CANDIDATE OPTION — NOT SELECTED]` Method A: Cryptographic digital signature on source PDF / asset.
   - `[CANDIDATE OPTION — NOT SELECTED]` Method B: SHA-256 digest matching published portal release.
   - `[CANDIDATE OPTION — NOT SELECTED]` Method C: Multi-party manual administrative review and sign-off.
   - `[CANDIDATE OPTION — NOT SELECTED]` Method D: Immutable audit log entry from authorized ingestion operator.
4. `[PRODUCT DECISION REQUIRED]` **Effective Date Determination:** How are policy effective dates established?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Explicit date stated in document text.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Official portal publication date.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Explicit examination cycle binding (e.g. valid for cycle 2024 only).
5. `[PRODUCT DECISION REQUIRED]` **Supersession Model:** How is policy supersession governed?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Explicit citation of predecessor document reference ID.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Automatic supersession by newer publication date for the same cycle.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Manual administrative revocation and activation.
6. `[PRODUCT DECISION REQUIRED]` **Corrigenda Interaction:** How do corrigenda interact with base policy documents?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Delta patch applied over base specification.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Full policy replacement required (new complete policy version created).
7. `[PRODUCT DECISION REQUIRED]` **Source Document Conflict:** What happens when two official documents for the same cycle contradict each other without an explicit precedence clause?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Profile-specific precedence hierarchy resolves conflict.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Fail-closed to `AUTHORITY_CONTRADICTION` quarantine.
8. `[PRODUCT DECISION REQUIRED]` **Precedence Scope:** Is document precedence universal across all exams, or strictly profile-specific?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly profile-specific (defined per `EXAM_POLICY_PROFILE`).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Universal platform precedence hierarchy.
9. `[PRODUCT DECISION REQUIRED]` **Authority Inference Prohibition:** Can Mock.AI ever infer authority when statutory documents are ambiguous?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly prohibited: ambiguity triggers quarantine pending formal clarification.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Default fallback rules apply.
10. `[PRODUCT DECISION REQUIRED]` **Pre-Execution Evidence Requirements:** What minimum evidence is required before an interpreted policy becomes eligible for runtime execution?
    - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Source Document URI + Digest + Signed Interpretation + 4-Eyes Approval.
    - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Administrative check-in with audit log.

---

# PART 6 — GOV-AP-004: Cohort Authority & Ingestion Model

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

`[IMPORTANT]` The concepts below are strictly separated:
- **Source Authority:** Entity with legal/academic jurisdiction to declare cohort truth.
- **Dataset Provider:** Entity generating or supplying the observation data.
- **Attestation Evidence:** Proof establishing dataset integrity and authenticity.
- **Ingestion Actor:** Operational process transporting or registering the record.

1. `[PRODUCT DECISION REQUIRED]` **Transformations Requiring Cohort Data:** Which transformations require cohort distribution data?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Multi-shift normalization / equating.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Percentile calculation.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Relative ranking.
2. `[PRODUCT DECISION REQUIRED]` **Authorized Dataset Providers:** Who may provide cohort observation data?
   - `[CANDIDATE OPTION — NOT SELECTED]` Provider A: Official client examination body.
   - `[CANDIDATE OPTION — NOT SELECTED]` Provider B: Internal platform aggregation of attempts submitted on Mock.AI.
   - `[CANDIDATE OPTION — NOT SELECTED]` Provider C: Third-party psychometric data vendor.
3. `[PRODUCT DECISION REQUIRED]` **Platform Cohort Authority:** Can candidate attempts collected on Mock.AI ever be authoritative cohort data for an exam profile?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly prohibited for official/statutory exams; requires official external cohort.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Permitted only for synthetic mock tests clearly labeled as simulated.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Permitted when sample size exceeds minimum threshold $N$.
4. `[PRODUCT DECISION REQUIRED]` **Authoritative Proof Required:** What evidence establishes that a supplied cohort dataset is authoritative?
   - `[CANDIDATE OPTION — NOT SELECTED]` Evidence A: Sealed record with verified attestation from authorized declaring entity.
   - `[CANDIDATE OPTION — NOT SELECTED]` Evidence B: Administrative database entry with audit logging.
5. `[PRODUCT DECISION REQUIRED]` **Attestation Evidence Requirement:** Is formal attestation evidence mandatory for cohort ingestion?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Mandatory attestation evidence required.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Optional / audit-log based.
6. `[PRODUCT DECISION REQUIRED]` **Verification Mechanism:** What verification mechanisms are acceptable?
   - `[CANDIDATE OPTION — NOT SELECTED]` Mechanism A: Asymmetric digital signature.
   - `[CANDIDATE OPTION — NOT SELECTED]` Mechanism B: HMAC token.
   - `[CANDIDATE OPTION — NOT SELECTED]` Mechanism C: Checksum digest + immutable audit log.
7. `[PRODUCT DECISION REQUIRED]` **Incomplete Dataset Policy:** What happens if a cohort dataset is missing one or more declared examination shifts?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Fail-closed (`INSUFFICIENT_COHORT_DATA`) — evaluation deferred.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Provisional score emitted with warning flag.
8. `[PRODUCT DECISION REQUIRED]` **Cohort Revision Policy:** What happens if authoritative cohort statistics are revised?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: New immutable cohort record version created; triggers governed re-evaluation run.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Existing cohort record updated in place.
9. `[PRODUCT DECISION REQUIRED]` **Historical Recomputation:** Can historical candidate results be recomputed upon cohort revision?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Governed recomputation permitted with superseding result receipts.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Historical receipts remain frozen forever; recomputation only on appeal.
10. `[PRODUCT DECISION REQUIRED]` **Synthetic Cohort Data:** Can Mock.AI ever manufacture or extrapolate missing cohort data?
    - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly prohibited across all exams.
    - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Permitted only for synthetic mock tests labeled as simulated.
    - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Permitted across all exams.

---

# PART 7 — GOV-AP-005: Policy AST / Domain-Specific Language (DSL)

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

`[IMPORTANT]` The questionnaire does NOT select an AST, DSL, library, or evaluator. It asks what expressive requirements and authoring roles must be supported:

### 1. Expressive Capabilities Required

| Dimension | Expressive Capability | Required for Mock.AI? `[PRODUCT DECISION REQUIRED]` | Rationale / Consideration |
|---|---|---|---|
| **A. Math** | Exact Rational Arithmetic ($\mathbb{Q} = n/d$) | `[FROZEN FACT]` Resolved conceptually under GOV-AP-006 | Prevents floating-point cutoff drift |
| **A. Math** | Rounding & Truncation Directives | `[ ]` YES `[ ]` NO | Reporting boundary rounding |
| **A. Math** | Piecewise Functions | `[ ]` YES `[ ]` NO | Multi-tier score curves |
| **B. Logic** | Relational Comparisons ($<, \le, =, \ge, >$) | `[ ]` YES `[ ]` NO | Cutoff and threshold checks |
| **B. Logic** | Conditional Branching (`if-then-else`) | `[ ]` YES `[ ]` NO | Disposition-dependent rules |
| **B. Logic** | Bounded Iterations / Aggregations | `[ ]` YES `[ ]` NO | Section item summations |
| **B. Logic** | Set & Interval Operations ($\in, [a, b]$) | `[ ]` YES `[ ]` NO | Option matching and NAT tolerances |
| **C. Data** | Access to Raw Item awardedMarks | `[FROZEN FACT]` Mandatory input dependency | Opaque item score consumption |
| **C. Data** | Access to Sealed Cohort Vectors | `[ ]` YES `[ ]` NO | Multi-shift normalization |
| **C. Data** | Access to Candidate Demographics | `[ ]` YES `[ ]` NO | Quota-aware scoring/cutoffs |
| **D. Bounds**| Concrete Execution Fuel / Step Limits | `[ENGINEERING DECISION FUTURE]` | Prevents infinite loop DoS |
| **D. Bounds**| Concrete Memory Allocation Limits | `[ENGINEERING DECISION FUTURE]` | Prevents memory exhaustion |
| **D. Bounds**| Maximum AST Tree Depth | `[ENGINEERING DECISION FUTURE]` | Candidate cap: depth 32 |
| **D. Bounds**| Maximum Rational Integer Bound | `[ENGINEERING DECISION FUTURE]` | Candidate cap: $2^{256}$ |

### 2. Policy Authoring Personas & Workflow
`[PRODUCT DECISION REQUIRED]` Who will author policy specifications in Mock.AI?
- `[CANDIDATE OPTION — NOT SELECTED]` Option A: Software Engineers exclusively (via JSON/YAML or code templates).
- `[CANDIDATE OPTION — NOT SELECTED]` Option B: Assessment Administrators / Academic Leads (via internal admin UI).
- `[CANDIDATE OPTION — NOT SELECTED]` Option C: External Client Assessment Bodies (via imported specifications).
- `[CANDIDATE OPTION — NOT SELECTED]` Option D: Dual persona (Engineers author, Academic Council reviews and approves).

---

# PART 8 — GOV-AP-010: Result Classification Ownership

`[UNRESOLVED]` Active governance domain. Implementation strictly blocked.

`[PRODUCT DECISION REQUIRED]` The Product Owner must determine which result status labels Mock.AI will support, who owns the rules, and how conflicts are handled:

| Classification Type | Neutral Functional Definition | In Scope for Mock.AI? `[PRODUCT DECISION REQUIRED]` | Authoritative Owner `[PRODUCT DECISION REQUIRED]` | Profile-Specific or Universal? `[PRODUCT DECISION REQUIRED]` | Action If No Rule Exists `[PRODUCT DECISION REQUIRED]` | Action If Sources Conflict `[PRODUCT DECISION REQUIRED]` |
|---|---|---|---|---|---|---|
| **Pass / Fail** | Clearing minimum aggregate percentage or section thresholds | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Academic Grade** | Letter grade or performance scale | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Qualification Class** | Eligibility status for subsequent examination stages | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Merit Class** | Distinction or honor classification | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Performance Band** | Psychometric proficiency bands | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Administrative Status**| Compliance status (`VALID`, `WITHHELD`, `EXPUNGED`) | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |
| **Custom Status** | Client-specific bespoke result labels | `[ ]` YES `[ ]` NO | `[ ]` Assessment Policy<br>`[ ]` Result Admin Domain<br>`[ ]` Phase 3.6 Gateway | `[ ]` Profile-Specific<br>`[ ]` Universal | `[ ]` Omit<br>`[ ]` Defer<br>`[ ]` Quarantine | `[ ]` Precedence<br>`[ ]` Quarantine |

---

# PART 9 — Failure and Quarantine Policy

`[PRODUCT DECISION REQUIRED]` When an evaluation anomaly occurs, the engine must execute a deterministic action. The Product Owner must assign an action for each failure class.

`[IMPORTANT]` The candidate actions (`EXECUTE`, `DEFER`, `QUARANTINE`, `REJECT`) are **candidate options only, not selected policies**:

### Failure Governance Matrix

| Failure Condition | Failure Classification Class | Resolution Level Scope `[PRODUCT DECISION REQUIRED]` | Candidate Actions `[CANDIDATE OPTIONS — NOT SELECTED]` | Selected Governance Action `[PRODUCT DECISION REQUIRED]` |
|---|---|---|---|---|
| **Missing Policy Version** | POLICY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Ambiguous Policy Directive** | POLICY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Conflicting Policy Directives** | AUTHORITY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Expired Policy Version** | POLICY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` EXECUTE (warn) `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Future-Dated Policy Version** | POLICY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Malformed Policy AST** | EXECUTION FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Unverifiable Source Authority** | AUTHORITY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Missing Cohort Dataset** | DATA FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Incomplete Cohort Shifts** | DATA FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` DEFER `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Contradictory Cohort Vectors** | DATA FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Unsupported Assessment Op** | SAFETY FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Resource Bound Violation** | NUMERICAL FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |
| **Mathematical Runtime Fault** | NUMERICAL FAILURE | `[ ]` Global `[ ]` Profile `[ ]` System Safety | `[ ]` QUARANTINE `[ ]` REJECT | `[PO DECISION]` |

---

# PART 10 — Historical Reproducibility & Retention Horizon

`[PRODUCT DECISION REQUIRED]` The Product Owner must define Mock.AI's legal, regulatory, and business commitments regarding historical reproducibility:

1. `[FROZEN FACT]` **Execution Replay Invariant:** Replay reproducibility is defined under the 11-element pinned execution specification $\mathcal{E}_{\text{pin}}$.
2. `[PRODUCT DECISION REQUIRED]` **Retention Horizon Commitment:** How long must Mock.AI guarantee bit-for-bit historical score reproducibility?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Indefinite retention (statutory / legal audit commitment).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Examination cycle duration only (e.g. 1 year post-result).
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Session-duration only (for transient mock attempts).
3. `[PRODUCT DECISION REQUIRED]` **Policy Version Immutability:** Can an active policy version ever be edited in place?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly immutable forever. Revisions require a new version ID.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Editable under administrative superuser override.
4. `[PRODUCT DECISION REQUIRED]` **Cohort Snapshot Immutability:** Can a sealed cohort dataset ever be modified in place?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Strictly immutable. Re-computations create superseding records.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Updatable in place.
5. `[PRODUCT DECISION REQUIRED]` **Post-Exam Corrigendum Behavior:** When an official body issues a post-exam corrigendum, what happens to existing scorecards?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Existing scorecards remain frozen; new scorecards created under new version.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Existing scorecards automatically recalculated and updated in place.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: Recalculation performed only upon candidate appeal.

---

# PART 11 — Multi-Tenancy & Authority Scoping

`[PRODUCT DECISION REQUIRED]` The Product Owner must establish the isolation boundary of policy authority without mandating database implementation:

1. `[PRODUCT DECISION REQUIRED]` **Policy Authority Scope:** At what level are assessment policies scoped?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: **Global Platform Default:** One universal policy engine for all Mock.AI assessments.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: **Tenant Scoped:** Strictly isolated by client organization.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option C: **Exam Cycle Scoped:** Isolated per examination cycle.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option D: **Paper Instance Scoped:** Isolated per paper instance.
2. `[PRODUCT DECISION REQUIRED]` **Cross-Tenant Policy Sharing:** Can a tenant inherit or extend another tenant's policy template?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Yes, global default templates can be inherited with tenant overrides.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Strictly NO: complete logical isolation between tenants.
3. `[PRODUCT DECISION REQUIRED]` **Cross-Tenant Collision Action:** What must happen if a candidate attempt from Tenant A queries a policy from Tenant B?
   - `[CANDIDATE OPTION — NOT SELECTED]` Option A: Immediate isolation violation quarantine.
   - `[CANDIDATE OPTION — NOT SELECTED]` Option B: Fallback to global platform default.

---

# PART 12 — Product Decision Register (AP-DEC-001 through AP-DEC-013)

`[PRODUCT DECISION REQUIRED / AUDIT STATUS NOTE]` Decisions AP-DEC-001 through AP-DEC-012 are documented in the Master Recovery Baseline as approved in a previous conversation, but remain `[UNDECIDED]` in the physical repository baseline pending formal re-ratification. AP-DEC-013 was explicitly approved by the Product Owner on 2026-10-08 and is formally `FROZEN`.

Every cataloged decision item is maintained below:

### AP-DEC-001: Initial Supported Exam Profiles
- **Question:** Which examination families are in scope for initial support?
- **Why It Matters:** Determines which pipeline stages and policy profiles must be designed.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Single-shift only (e.g. UPSC Prelims, single-session GATE).
  - Option B `[CANDIDATE OPTION]`: Multi-shift equated exams (e.g. SSC CHSL, GATE multi-session).
  - Option C `[CANDIDATE OPTION]`: Both single-shift and multi-shift exams.
- **Consequences:** Option B and C require cohort ingestion mechanisms (`GOV-AP-004`).
- **Dependencies:** Part 2 candidate table.
- **Current Frozen Constraints:** Phase 3.5 provides raw scores only.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-002: Assessment Capability Boundary
- **Question:** Which of the 20 assessment capabilities are in scope, out of scope, or profile-specific?
- **Why It Matters:** Prevents implementing unneeded mathematical domains or unauthorized scoring features.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Raw scores and dropped-item rescaling only.
  - Option B `[CANDIDATE OPTION]`: Full suite including equating, percentiles, ranking, and qualification.
  - Option C `[CANDIDATE OPTION]`: Profile-delegated capability set.
- **Consequences:** Option B expands scope across unresolved domains `GOV-AP-001`, `002`, `004`.
- **Dependencies:** Part 1 capability table.
- **Current Frozen Constraints:** Phase 3.5 raw scores cannot be altered.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-003: Qualification Domain Ownership (`GOV-AP-001`)
- **Question:** Does Mock.AI evaluate pass/fail/qualification, and does it belong inside Assessment Policy?
- **Why It Matters:** Prevents candidate demographic quota rules from polluting the pure assessment engine.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Pure score engine only; qualification OUT OF SCOPE.
  - Option B `[CANDIDATE OPTION]`: Inside Assessment Policy Layer.
  - Option C `[CANDIDATE OPTION]`: Independent downstream Qualification Service.
- **Consequences:** Option A minimizes scope; Option C maintains clean separation of duties.
- **Dependencies:** Part 3 questions 1–9.
- **Current Frozen Constraints:** `GOV-AP-001` is UNRESOLVED.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-004: Ranking & Merit Ownership (`GOV-AP-002`)
- **Question:** Does Mock.AI calculate candidate ranks, and does full-cohort sorting belong in UADUE?
- **Why It Matters:** Ranking requires full-cohort visibility; must never enter read-only Phase 3.6.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Out of scope (scores and percentiles only).
  - Option B `[CANDIDATE OPTION]`: Raw ordinal ranking inside Assessment Policy.
  - Option C `[CANDIDATE OPTION]`: Independent batch Ranking & Merit Service.
- **Consequences:** Option C protects Phase 3.6 read-only gateway.
- **Dependencies:** Part 4 questions 1–9.
- **Current Frozen Constraints:** Phase 3.6 is strictly locked and read-only.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-005: Source Authority Precedence (`GOV-AP-003`)
- **Question:** How is source document authenticity and precedence established?
- **Why It Matters:** Prevents hardcoding false universal legal hierarchies across different exam types.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Strictly profile-specific precedence.
  - Option B `[CANDIDATE OPTION]`: Universal platform legal hierarchy.
- **Consequences:** Option A maintains legal fidelity across diverse testing bodies.
- **Dependencies:** Part 5 questions 1–10.
- **Current Frozen Constraints:** `GOV-AP-003` is UNRESOLVED / SOURCE-CLASS DEPENDENT.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-006: Cohort Ingestion Model (`GOV-AP-004`)
- **Question:** Who is authorized to supply cohort statistics, and is synthetic data ever permitted?
- **Why It Matters:** Governs validity of multi-shift equating and percentiles.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: External official examination body only.
  - Option B `[CANDIDATE OPTION]`: Platform candidate attempts permitted for synthetic mock tests only.
  - Option C `[CANDIDATE OPTION]`: Platform candidate attempts permitted across all exams.
- **Consequences:** Option A guarantees statutory fidelity; Option B enables mock test rankings.
- **Dependencies:** Part 6 questions 1–10.
- **Current Frozen Constraints:** `GOV-AP-004` is UNRESOLVED / SOURCE-CLASS DEPENDENT.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-007: Policy Language Persona & Expressive Scope (`GOV-AP-005`)
- **Question:** What expressive capabilities are required, and who will author policies?
- **Why It Matters:** Determines whether the policy sandbox requires dynamic parsing or structured AST evaluation.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Software engineers author structured AST JSON.
  - Option B `[CANDIDATE OPTION]`: Academic administrators author via internal administrative UI.
  - Option C `[CANDIDATE OPTION]`: External client assessment specifications.
- **Consequences:** Option A requires lowest initial dependency footprint; Option B requires authoring tooling.
- **Dependencies:** Part 7 expressive table.
- **Current Frozen Constraints:** `GOV-AP-005` is UNRESOLVED.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-008: Result Classification Ownership (`GOV-AP-010`)
- **Question:** Which result labels are supported, and where does classification logic reside?
- **Why It Matters:** Decouples administrative status labels from pure assessment score math.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Out of scope (scores only).
  - Option B `[CANDIDATE OPTION]`: Inside Assessment Policy Layer.
  - Option C `[CANDIDATE OPTION]`: Downstream Result Administration Domain.
- **Consequences:** Option C keeps assessment scoring pure and modular.
- **Dependencies:** Part 8 classification table.
- **Current Frozen Constraints:** `GOV-AP-010` is UNRESOLVED.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-009: Failure & Quarantine Policy
- **Question:** What deterministic action applies to each failure condition, and at what scope is it defined?
- **Why It Matters:** Eliminates undefined runtime fallback hacks and protects system safety.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Universal fail-closed (quarantine or reject all anomalies).
  - Option B `[CANDIDATE OPTION]`: Profile-defined action matrix with provisional scoring flags.
- **Consequences:** Option A provides maximum legal safety; Option B allows more flexible user feedback.
- **Dependencies:** Part 9 failure matrix.
- **Current Frozen Constraints:** Evaluation must remain deterministic.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-010: Historical Reproducibility Retention Horizon
- **Question:** What is the mandatory retention horizon for bit-for-bit historical score replay?
- **Why It Matters:** Determines archival storage contracts and snapshot preservation mechanisms.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Indefinite statutory retention.
  - Option B `[CANDIDATE OPTION]`: Active examination cycle duration (e.g. 1 year).
  - Option C `[CANDIDATE OPTION]`: Session duration only.
- **Consequences:** Option A imposes long-term storage requirements; Option C reduces archival overhead.
- **Dependencies:** Part 10 questions 1–5.
- **Current Frozen Constraints:** $\mathcal{E}_{\text{pin}}$ pinned execution contract (`GOV-AP-008`).
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-011: Multi-Tenancy Authority Scoping
- **Question:** What is the isolation boundary for policy authority?
- **Why It Matters:** Determines policy resolution hierarchy and prevents cross-client data leaks.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Global platform default only.
  - Option B `[CANDIDATE OPTION]`: Strict tenant-level isolation.
  - Option C `[CANDIDATE OPTION]`: Hierarchical inheritance (Global $\to$ Tenant $\to$ Exam $\to$ Paper).
- **Consequences:** Option B guarantees complete multi-tenant security; Option C maximizes template reusability.
- **Dependencies:** Part 11 questions 1–3.
- **Current Frozen Constraints:** Multi-tenant isolation is a binding architectural invariant.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `UNDECIDED`

---

### AP-DEC-012: Psychometric / Item Response Theory (IRT) Capabilities
- **Question:** Does Mock.AI require non-linear psychometric latent trait scaling?
- **Why It Matters:** Determines whether complex numerical calibration routines are needed.
- **Available Options:**
  - Option A `[CANDIDATE OPTION]`: Out of scope (classical test theory only).
  - Option B `[CANDIDATE OPTION]`: Deferred to future psychometric roadmap.
  - Option C `[CANDIDATE OPTION]`: In scope for advanced mock diagnostics.
- **Consequences:** Option A keeps engine scope bounded and exact rational arithmetic tractable.
- **Dependencies:** Part 1 capability 20.
- **Current Frozen Constraints:** Numerical arithmetic requires exact rational form $\mathbb{Q} = n/d$.
- **Product Owner Decision:** `[UNDECIDED]`
- **Status:** `OPTIONAL FUTURE`

---

### AP-DEC-013: Automated Natural Language Policy Ingestion
- **Question:** Does Mock.AI permit AI/LLM-based automatic extraction of scoring rules from brochures?

#### HISTORICAL OPTIONS — NON-OPERATIVE
*Audit Evidence Note:* The candidate options and associated rationale below are retained for historical auditability and traceability from earlier governance passes. They are non-operative and must not be interpreted as operative Release 1 policy, nor as evidence of mandatory human authorship, mandatory four-eyes review, or authorization for fully automated policy extraction:
- **Historical Candidate Options:**
  - Option A `[CANDIDATE OPTION — SUPERSEDED]`: Strictly prohibited. All policies require authorized human interpretation.
  - Option B `[CANDIDATE OPTION — NOT SELECTED]`: Permitted with mandatory human 4-eyes approval.
  - Option C `[CANDIDATE OPTION — NOT SELECTED]`: Fully automated extraction.
- **Historical Context / Dependencies:** Three-tier provenance model (Tier 1 $\to$ Tier 2 $\to$ Tier 3).

#### CURRENT OPERATIVE DECISION
- **Product Owner Decision:** `FROZEN — APPROVED BY PRODUCT OWNER (2026-10-08)`
- **Decision Status:** `FROZEN`
- **Operative Release 1 Policy:** Release 1 does not authorize an AI/LLM or automated ingestion agent to autonomously convert source-language assessment-policy material directly into authoritative executable assessment-policy rules.
- **Authority Invariant:** AI/LLM systems possess zero policy authority. They must not independently declare, establish, approve, attest, or issue authoritative policy.
- **Provenance Invariant:** The three-tier provenance model (Tier 1 Source Fact $\to$ Tier 2 Authorized Interpretation $\to$ Tier 3 Machine AST) and the Zero-Orphan rule ($\forall r \in \text{Tier 3}, \exists i \in \text{Tier 2}, \exists s \in \text{Tier 1} \text{ s.t. } r \to i \to s$) remain binding.
- **Future AI-Assisted Drafting:** `UNDECIDED / NOT AUTHORIZED BY AP-DEC-013`.
- **Implementation Status:** `STRICTLY LOCKED` (Zero code, schemas, or pipelines permitted).
- **Approval Evidence Reference:** Explicit Product Owner approval recorded in Antigravity session on 2026-10-08T19:38:43-07:00.
- **Authoritative Decision Record:** [`AP_DEC_013_AUTOMATED_POLICY_INGESTION.md`](file:///Users/shivarampatel/Desktop/MOCK.AI/docs/uadue/assessment_policy/AP_DEC_013_AUTOMATED_POLICY_INGESTION.md)
- **Documented Adjacent Protocol Gaps:** (1) Pre-flight ingestion schema rejection error codes remain un-enumerated in AP-DEC-009; (2) `AUTHORITY_CONTRADICTION` is referenced conceptually in `GOV-AP-003` but evaluated at runtime under `PROVENANCE_CONTRADICTION`.

---

# PART 13 — Formal Implementation Authorization Boundary

`[FROZEN FACT]` Implementation remains strictly locked. The table below defines the exact governance prerequisites that must be completed before any future implementation gate can be authorized:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ COMPONENT / GATE               │ PREREQUISITE PRODUCT OWNER DECISIONS   │
├────────────────────────────────┼────────────────────────────────────────┤
│ A. Assessment-Policy           │ AP-DEC-001, AP-DEC-002, AP-DEC-005,    │
│    Implementation Authorization│ AP-DEC-007, AP-DEC-009, AP-DEC-011     │
├────────────────────────────────┼────────────────────────────────────────┤
│ B. Policy Execution Engine     │ AP-DEC-001, AP-DEC-007, AP-DEC-009,    │
│    Sandbox & Evaluation Logic  │ (DSL selection formally approved)      │
├────────────────────────────────┼────────────────────────────────────────┤
│ C. Qualification Domain        │ AP-DEC-003                             │
│    (Category Quotas & Cutoffs) │ (GOV-AP-001 formally resolved)         │
├────────────────────────────────┼────────────────────────────────────────┤
│ D. Ranking & Merit Domain      │ AP-DEC-004, AP-DEC-006                 │
│    (Full-Cohort Percentiles)   │ (GOV-AP-002 & 004 formally resolved)   │
├────────────────────────────────┼────────────────────────────────────────┤
│ E. Result Classification       │ AP-DEC-008                             │
│    (Pass/Fail/Withheld Status) │ (GOV-AP-010 formally resolved)         │
├────────────────────────────────┼────────────────────────────────────────┤
│ F. Phase 3.6 Result Projection │ A, B, C, D, E completed and certified  │
│    Gateway Implementation      │ (Read-only projection DTOs sealed)     │
└────────────────────────────────┴────────────────────────────────────────┘
```

> [!CAUTION]
> **Zero Implementation Status:** None of the components (A through F) are authorized.  
> No code, database tables, migrations, or algorithms will be generated until the Product Owner completes and formally signs off on the required decisions in this questionnaire.
