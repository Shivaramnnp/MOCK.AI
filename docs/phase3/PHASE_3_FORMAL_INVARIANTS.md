# UADUE Phase 3 — Formal Invariants Specification
**Document ID:** `UADUE-P3-INV-016`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Mathematical Invariants & Formal Proof Contracts  

---

## 1. Executive Summary & Mathematical Framework

The UADUE Phase 3 architecture is governed by 20 non-negotiable formal invariants. Each invariant is expressed in predicate calculus, specifies its enforcement boundary, defines system behavior upon violation, and mandates an exact verification mechanism.

---

## 2. Formal Invariants Catalog (P3-I01 through P3-I20)

### P3-I01: Source Immutability
- **Formal Definition:**
  $$\forall s \in \text{SourceDocuments}, \forall t_1, t_2: \quad \text{SHA256}(s, t_1) = \text{SHA256}(s, t_2)$$
- **Enforcement Boundary:** Upstream Phase 2A/2B/2C contracts; read-only file systems; immutable S3 buckets.
- **Violation Behavior:** Immediate system panic; quarantine of pipeline.
- **Verification Method:** Binary cryptographic checksum recalculation.

### P3-I02: Package Immutability
- **Formal Definition:**
  $$\forall p \in \text{CanonicalPackages}, \forall t_1, t_2: \quad \text{PackageSeal}(p, t_1) = \text{PackageSeal}(p, t_2)$$
- **Enforcement Boundary:** Phase 2D-8 PostgreSQL row immutability triggers; `package_integrity_seal` verification.
- **Violation Behavior:** Package rejected; database transaction rolls back.
- **Verification Method:** Independent cryptographic seal verification test suite.

### P3-I03: Publication Immutability & Idempotency
- **Formal Definition:**
  $$\forall e_1, e_2 \in \text{PublicationEvents}: (e_1.\text{fingerprint} = e_2.\text{fingerprint}) \implies (e_1.\text{packageId} = e_2.\text{packageId} \land e_1.\text{seal} = e_2.\text{seal})$$
- **Enforcement Boundary:** `canonical_package_events` PostgreSQL uniqueness constraints and publication gateway.
- **Violation Behavior:** Conflicting publication requests fail with `409 Conflict`.
- **Verification Method:** Concurrency stress test (100 concurrent publication workers).

### P3-I04: Session Identity Immutability
- **Formal Definition:**
  $$\forall s \in \text{ExamSessions}: \quad s.\text{packageId}, s.\text{packageSeal}, s.\text{tenantId}, s.\text{candidateId} \text{ are strictly immutable after creation.}$$
- **Enforcement Boundary:** PostgreSQL database triggers preventing `UPDATE` of foreign key columns on `exam_sessions`.
- **Violation Behavior:** SQL exception `IMMUTABLE_COLUMN_MODIFICATION`.
- **Verification Method:** Adversarial database update tests.

### P3-I05: Attempt Reproducibility
- **Formal Definition:**
  $$\forall s \in \text{ExamSessions}, \forall t \ge s.\text{submittedAt}: \quad \mathcal{R}(s.\text{events}) \equiv \text{AttemptSnapshot}(s)$$
  Where $\mathcal{R}$ is the deterministic submission reducer function.
- **Enforcement Boundary:** Pure TypeScript / SQL event reducer.
- **Violation Behavior:** Audit alert; evaluation worker halt.
- **Verification Method:** Replay of event stream produces bit-for-bit identical snapshot.

### P3-I06: Submission Idempotency
- **Formal Definition:**
  $$\forall e \in \text{SubmissionEvents}: \quad \text{Persist}(e) \circ \text{Persist}(e) = \text{Persist}(e)$$
  $$\text{Receipt}(e)_1 = \text{Receipt}(e)_2$$
- **Enforcement Boundary:** Unique constraint `(exam_session_id, client_event_id)` and response payload hash check.
- **Violation Behavior:** Duplicate returns original receipt; altered duplicate returns `409 Conflict`.
- **Verification Method:** Network retry simulation test suite.

### P3-I07: Server-Authoritative Scoring
- **Formal Definition:**
  $$\text{Score}(s) = \mathcal{F}_{\text{eval}}(\text{AttemptSnapshot}(s), \text{Package}(s), \Pi_{\text{frozen}}, \mathcal{K}_{\text{frozen}})$$
  $$\forall c \in \text{Client}: \quad c \text{ has zero influence over } \text{Score}(s).$$
- **Enforcement Boundary:** Asynchronous scoring worker executing Phase 2D-5 evaluation code.
- **Violation Behavior:** Client score payload completely discarded.
- **Verification Method:** End-to-end scoring boundary integration tests.

### P3-I08: Answer Non-Leakage (Zero Live Disclosure)
- **Formal Definition:**
  $$\forall q \in \text{Tier3Projection}: \quad \text{Keys}(q) \cap \{\text{authoritativeAnswer}, \text{solution}, \text{rubric}, \text{dagNodes}\} = \emptyset$$
- **Enforcement Boundary:** Server-side JSON serialization filtering before network transmission.
- **Violation Behavior:** Pre-serialization assertion failure; HTTP 500 error; zero payload emitted.
- **Verification Method:** Automated schema scanner asserting zero forbidden properties in Tier 3 output.

### P3-I09: Absolute Tenant Isolation
- **Formal Definition:**
  $$\forall t_A \neq t_B, \forall r_A \in \text{Resources}(t_A): \quad \text{Query}(t_B, r_A.\text{id}) = \emptyset \land \text{Response} = 404$$
- **Enforcement Boundary:** PostgreSQL Row-Level Security (`current_setting('app.current_tenant_id')`).
- **Violation Behavior:** Zero rows returned; uniform HTTP 404 response.
- **Verification Method:** Cross-tenant penetration test suite.

### P3-I10: Permanent Historical Reproducibility
- **Formal Definition:**
  $$\forall \text{Run} \in \text{EvaluationRuns}: \quad \mathcal{F}_{\text{eval}}(\mathcal{A}_{\text{run}}, \mathcal{P}_{\text{run}}, \Pi_{\text{run}}, \mathcal{K}_{\text{run}}) = \text{Run}.\text{result}$$
  $$\forall t > \text{Run}.\text{createdAt}: \quad \text{Recalculate}(\text{Run}, t) \equiv \text{Run}.\text{result}$$
- **Enforcement Boundary:** Immutable storage of version identifiers and parameter hashes in evaluation runs.
- **Violation Behavior:** Cryptographic signature mismatch alert.
- **Verification Method:** Historical replay test executing evaluations against simulated time jumps.

### P3-I11: Content-Addressed Asset Integrity
- **Formal Definition:**
  $$\forall a \in \text{Assets}: \quad a.\text{id} = \text{SHA256}(a.\text{bytes})$$
- **Enforcement Boundary:** Content-addressed asset storage and edge CDN verification gateway.
- **Violation Behavior:** HTTP 502 Bad Gateway; security alert; fallback to cold replica.
- **Verification Method:** Binary tamper injection tests.

### P3-I12: Deterministic Retry Behavior
- **Formal Definition:**
  $$\forall r \in \text{Requests}: \quad \text{Exec}(r) \text{ after network failure yields identical system state and response.}$$
- **Enforcement Boundary:** Gateway idempotency cache and PostgreSQL unique constraints.
- **Violation Behavior:** Gateway returns standard idempotency conflict error.
- **Verification Method:** Chaos network drop tests.

### P3-I13: No Client-Authoritative State
- **Formal Definition:**
  $$\forall \text{StateProperty} \in \{\text{TimerDeadline}, \text{CurrentScore}, \text{SessionState}, \text{Eligibility}\}: \quad \text{StateProperty}_{\text{authoritative}} = \text{ServerEvaluate}()$$
- **Enforcement Boundary:** Centralized server FSM and monotonic clock calculations.
- **Violation Behavior:** Client-supplied state overrides ignored completely.
- **Verification Method:** Clock skew and state injection unit tests.

### P3-I14: Projection Isolation
- **Formal Definition:**
  $$\text{Tier3}(\text{Package}) \subset \text{Tier2}(\text{Package}) \subset \text{Tier1}(\text{Package})$$
  $$\text{InformationEntropy}(\text{Tier3}) < \text{InformationEntropy}(\text{Tier1})$$
- **Enforcement Boundary:** Strongly typed domain projection adapters.
- **Violation Behavior:** Type-checker and runtime serializer rejection.
- **Verification Method:** Property-based fuzzing of projection outputs.

### P3-I15: Comprehensive & Privacy-Preserving Audit
- **Formal Definition:**
  $$\forall \text{StateTransition} \in \text{FSM}: \quad \exists ! \text{AuditEvent} \in \text{AuditLedger}$$
  $$\forall a \in \text{AuditLedger}: \quad \text{PII}(a) = \emptyset \land \text{AnswerKeys}(a) = \emptyset$$
- **Enforcement Boundary:** Append-only PostgreSQL trigger logging state changes.
- **Violation Behavior:** Transaction fails if audit log insertion fails.
- **Verification Method:** Audit log completeness reconciliation against session transitions.

### P3-I16: Monotonic Sequence Integrity
- **Formal Definition:**
  $$\forall e_i, e_j \in \text{SubmissionEvents}(s): \quad (i < j) \iff (e_i.\text{serverSequenceNumber} < e_j.\text{serverSequenceNumber})$$
- **Enforcement Boundary:** PostgreSQL `BIGSERIAL` sequence assignment inside serial transaction lock.
- **Violation Behavior:** Transaction retry.
- **Verification Method:** Monotonic sequence continuity assertion in test suites.

### P3-I17: Single Active Lease Invariant
- **Formal Definition:**
  $$\forall s \in \text{ExamSessions}: \quad |\text{ActiveLeases}(s)| \le 1$$
- **Enforcement Boundary:** Atomic lease renewal and heartbeat update in `exam_sessions`.
- **Violation Behavior:** Stale device receives HTTP 401 Unauthorized (`E_LEASE_REVOKED`).
- **Verification Method:** Multi-browser concurrent session testing.

### P3-I18: Append-Only Corrigendum DAG
- **Formal Definition:**
  $$\forall \text{Run}_{k+1} \text{ superseding } \text{Run}_k: \quad \text{Run}_{k+1}.\text{supersedesRunId} = \text{Run}_k.\text{id} \land \text{Run}_k \text{ remains unaltered.}$$
- **Enforcement Boundary:** Database foreign key DAG without cascade update/delete.
- **Violation Behavior:** Database constraint failure.
- **Verification Method:** DAG integrity traversals.

### P3-I19: Terminal State Non-Reversibility
- **Formal Definition:**
  $$\forall s \in \text{ExamSessions}: \quad s.\text{state} \in \{\text{SUBMITTED}, \text{EXPIRED}, \text{TERMINATED}\} \implies \forall t > t_{\text{terminal}}, s.\text{state}(t) = s.\text{state}(t_{\text{terminal}})$$
- **Enforcement Boundary:** FSM Transition Reducer and PostgreSQL check constraints.
- **Violation Behavior:** HTTP 409 Conflict rejection of any subsequent state transition request.
- **Verification Method:** State transition table exhaustive reachability tests.

### P3-I20: Privacy-Preserving Telemetry & Metric Cardinality
- **Formal Definition:**
  $$\forall m \in \text{PrometheusMetrics}: \quad \text{Labels}(m) \cap \{\text{candidateId}, \text{candidateEmail}, \text{sessionToken}, \text{answerText}\} = \emptyset$$
  $$|\text{LabelValues}(m)| \le 1000$$
- **Enforcement Boundary:** OpenTelemetry SDK metric filter and exporter sanitizers.
- **Violation Behavior:** Metric drop and developer warning.
- **Verification Method:** Static analysis of Prometheus metric registry.
