# UADUE Phase 3 — Adversarial Scenarios & Failure Analysis
**Document ID:** `UADUE-P3-ADV-015`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Adversarial Matrix & Fault Injection Specification  

---

## 1. Executive Summary & Verification Protocol

Phase 3 defines a comprehensive battery of 40 formal adversarial and edge-case failure scenarios. For each scenario, the specification details the exact fault injection vector, the invariant tested, the authoritative governing component, expected system behavior, recovery workflow, and required audit evidence.

---

## 2. Adversarial Scenarios (SCEN-P3-01 through SCEN-P3-40)

### SCEN-P3-01: Identical Duplicate Submission
- **Attack / Failure:** Network retransmission sends identical submission payload twice.
- **Invariant Tested:** `P3-I06` (Submission Idempotency).
- **Expected System Behavior:** Server detects identical `(examSessionId, clientEventId)` and matching response fingerprint; returns original `SubmissionReceipt` with HTTP 200 without appending a duplicate row.
- **Authoritative Component:** Ingestion Gateway & Submission Event Ledger.
- **Recovery Behavior:** Client receives acknowledgment; ledger count unchanged.
- **Audit Evidence:** Trace event logged with `status: IDEMPOTENT_REPLAY`.

### SCEN-P3-02: Conflicting Payload Replay (Tampered Event ID)
- **Attack / Failure:** Malicious client reuses previously acknowledged `clientEventId` with different selected option.
- **Invariant Tested:** `P3-I06` (Submission Idempotency & Tamper Resistance).
- **Expected System Behavior:** Server detects collision with differing payload fingerprint; rejects immediately with HTTP 409 Conflict (`E_PAYLOAD_TAMPERED`).
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Client must generate new `clientEventId` and increment `clientSequenceNumber` to submit new answer.
- **Audit Evidence:** Security audit log entry `SUBMISSION_TAMPER_DETECTED`.

### SCEN-P3-03: Modified Package ID in Submission
- **Attack / Failure:** Attacker alters `packageId` in submission envelope to target a different exam.
- **Invariant Tested:** `P3-I04` (Session Identity Immutability).
- **Expected System Behavior:** Gateway verifies `submission.packageId == session.packageId`; rejects with HTTP 400 Bad Request (`E_PACKAGE_MISMATCH`).
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Connection dropped; no database mutation.
- **Audit Evidence:** Warning log `PACKAGE_ID_MISMATCH_ATTEMPT`.

### SCEN-P3-04: Modified Package Integrity Seal
- **Attack / Failure:** Candidate modifies `packageIntegritySeal` string in submission header.
- **Invariant Tested:** `P3-I02` (Package Immutability & Seal Binding).
- **Expected System Behavior:** Gateway verifies seal against active session seal; rejects with HTTP 400 Bad Request (`E_SEAL_MISMATCH`).
- **Authoritative Component:** Session Orchestrator.
- **Recovery Behavior:** Request fails closed.
- **Audit Evidence:** Audit log `SECURITY_SEAL_MISMATCH`.

### SCEN-P3-05: Answer Leakage via DevTools Network Inspection
- **Attack / Failure:** Candidate inspects browser network tab attempting to find correct answer keys in JSON payload.
- **Invariant Tested:** `P3-I08` (Zero Answer Leakage).
- **Expected System Behavior:** Tier 3 projection strictly omits `authoritativeAnswer`, `solution`, and scoring internals; only stems and options are received.
- **Authoritative Component:** Projection Engine.
- **Recovery Behavior:** Candidate finds zero answer metadata.
- **Audit Evidence:** Projection schema validation test passes.

### SCEN-P3-06: Cross-Tenant Session Access (IDOR Attempt)
- **Attack / Failure:** Candidate in Tenant A sends request with valid session token to access session belonging to Tenant B.
- **Invariant Tested:** `P3-I09` (Tenant Isolation).
- **Expected System Behavior:** Gateway and PostgreSQL RLS filter by `tenant_id = app.current_tenant_id`; query returns zero rows; returns HTTP 404 Not Found.
- **Authoritative Component:** PostgreSQL RLS & Auth Gateway.
- **Recovery Behavior:** Attacker receives standard 404.
- **Audit Evidence:** Security event `CROSS_TENANT_ACCESS_DENIED`.

### SCEN-P3-07: Stale Session Submission
- **Attack / Failure:** Candidate submits answer to an `INITIALIZED` session before it has been formally started.
- **Invariant Tested:** `P3-I13` (Server-Authoritative State).
- **Expected System Behavior:** FSM verifies state is not `ACTIVE`; rejects with HTTP 409 Conflict (`E_SESSION_NOT_ACTIVE`).
- **Authoritative Component:** Exam Session Orchestrator FSM.
- **Recovery Behavior:** Client prompted to launch exam first.
- **Audit Evidence:** Operational event `SUBMISSION_BEFORE_START`.

### SCEN-P3-08: Submission After Session Expiration
- **Attack / Failure:** Candidate submits answer 2 minutes after server countdown reached zero.
- **Invariant Tested:** `P3-I04` (Terminal State Non-Reversibility).
- **Expected System Behavior:** Session is in `EXPIRED` state; rejects with HTTP 403 Forbidden (`E_SESSION_EXPIRED`).
- **Authoritative Component:** Exam Session Orchestrator FSM.
- **Recovery Behavior:** Player transitioned to terminal completion screen.
- **Audit Evidence:** Session audit event `LATE_SUBMISSION_REJECTED`.

### SCEN-P3-09: Concurrent Submissions from Same Client
- **Attack / Failure:** Two asynchronous requests with sequence 5 and sequence 6 arrive simultaneously at gateway.
- **Invariant Tested:** `P3-I06` (Monotonic Sequence Integrity).
- **Expected System Behavior:** Database acquires transaction lock per session; server sequences assigned monotonically (e.g., 101, 102); both persisted safely.
- **Authoritative Component:** PostgreSQL Submission Event Ledger.
- **Recovery Behavior:** Both receipts issued to client.
- **Audit Evidence:** Monotonic sequence progression verified in ledger.

### SCEN-P3-10: Concurrent Multi-Device Session Attempt
- **Attack / Failure:** Candidate opens exam on second device while active on first device.
- **Invariant Tested:** `P3-I13` (Single Active Lease Invariant).
- **Expected System Behavior:** Device 2 login revokes Lease 1; Device 1 receives HTTP 401 Unauthorized (`E_LEASE_REVOKED`) on next heartbeat or submit.
- **Authoritative Component:** Session Orchestrator Lease Manager.
- **Recovery Behavior:** Device 1 session locked; candidate continues on Device 2.
- **Audit Evidence:** Audit event `SESSION_LEASE_ROTATED`.

### SCEN-P3-11: Mid-Exam Browser Crash
- **Attack / Failure:** Browser process terminates abnormally while candidate is mid-question.
- **Invariant Tested:** `P3-I05` (Attempt Reproducibility & Recovery).
- **Expected System Behavior:** On restart, player reads encrypted IndexedDB journal; syncs with server `lastServerSequence`; restores exam state in $< 2$ seconds.
- **Authoritative Component:** Client Recovery Journal & Session State API.
- **Recovery Behavior:** Seamless candidate restoration.
- **Audit Evidence:** Audit log `SESSION_RECOVERED_AFTER_CRASH`.

### SCEN-P3-12: Network Timeout During Submission
- **Attack / Failure:** Client sends submission, server persists row, but TCP connection drops before client receives receipt.
- **Invariant Tested:** `P3-I12` (Deterministic Retry Behavior).
- **Expected System Behavior:** Client times out and retries with same `clientEventId`; server detects existing event, returns original receipt immediately.
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Client journal marked acknowledged.
- **Audit Evidence:** Idempotent retry hit in gateway logs.

### SCEN-P3-13: Extended Network Disconnection with Reconnect
- **Attack / Failure:** Internet drops for 10 minutes during exam; candidate continues answering offline.
- **Invariant Tested:** `P3-I06` (Event Journaling & Ingestion).
- **Expected System Behavior:** On reconnect, client flushes array of 8 buffered events; server processes inside single atomic transaction; returns batch receipts.
- **Authoritative Component:** Batch Submission Gateway.
- **Recovery Behavior:** Full synchronization.
- **Audit Evidence:** Batch receipt logged with event count.

### SCEN-P3-14: Offline Replay with Expired Deadline
- **Attack / Failure:** Candidate disconnects, answers questions for 30 minutes past official end time, then reconnects.
- **Invariant Tested:** `P3-I04` & `P3-I07` (Server Timing Authority).
- **Expected System Behavior:** Server notes session expired at official deadline; rejects all events recorded after deadline $+ 15$s grace window; auto-seals attempt.
- **Authoritative Component:** Session Orchestrator.
- **Recovery Behavior:** Partial evaluation of pre-deadline answers only.
- **Audit Evidence:** Log `OFFLINE_SUBMISSIONS_EXPIRED_DROPPED`.

### SCEN-P3-15: Out-of-Order Client Events
- **Attack / Failure:** Client sends event 12 over WebSocket and event 11 over HTTP; 12 arrives first.
- **Invariant Tested:** `P3-I06` (Sequence Reducer Robustness).
- **Expected System Behavior:** Server accepts both into ledger; state reducer orders by `client_sequence_number ASC` when calculating effective response.
- **Authoritative Component:** Ingestion Reducer.
- **Recovery Behavior:** Correct answer state derived.
- **Audit Evidence:** Sequence reconciliation test passes.

### SCEN-P3-16: Duplicate Client Events in Same Batch
- **Attack / Failure:** Client submits batch payload containing duplicate `clientEventId`.
- **Invariant Tested:** `P3-I06` (Batch Atomicity).
- **Expected System Behavior:** Server de-duplicates batch elements in memory; rejects conflicting duplicates; persists unique events.
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Batch processed cleanly.
- **Audit Evidence:** Batch ingestion metrics incremented.

### SCEN-P3-17: Malicious Client Clock Manipulation
- **Attack / Failure:** Candidate sets device clock back 5 hours to trick timer countdown.
- **Invariant Tested:** `P3-I13` (Server Timing Authority).
- **Expected System Behavior:** Player timer is synchronized to server monotonic clock (`serverNow - startTime`); local clock change has zero effect.
- **Authoritative Component:** Player Sync Engine.
- **Recovery Behavior:** Timer continues normal countdown.
- **Audit Evidence:** Telemetry records clock skew anomaly.

### SCEN-P3-18: Post-Exam Scoring Policy Change
- **Attack / Failure:** Institution updates negative marking scheme from $-0.33$ to $-0.25$ after exam concluded.
- **Invariant Tested:** `P3-I10` (Historical Reproducibility).
- **Expected System Behavior:** Original `EvaluationRun` (v1) remains completely immutable. New policy creates `EvaluationRun` (v2) with `runIteration: 2, supersedesRunId: v1`.
- **Authoritative Component:** Scoring Boundary Engine.
- **Recovery Behavior:** Both evaluations permanently auditable in DAG.
- **Audit Evidence:** Audit log `EVALUATION_RESCORED_POLICY_CHANGE`.

### SCEN-P3-19: Official Answer Key Corrigendum
- **Attack / Failure:** Institutional key revised: Q.42 changes from Option B to Option C.
- **Invariant Tested:** `P3-I10` (Corrigendum Reproducibility).
- **Expected System Behavior:** New evaluation run iteration executes; recalculates score using new `answerKeyVersion`; links to previous run.
- **Authoritative Component:** Scoring Evaluation Subsystem.
- **Recovery Behavior:** Candidates receive revised scorecards with audit explanation.
- **Audit Evidence:** Corrigendum log `ANSWER_KEY_CORRIGENDUM_APPLIED`.

### SCEN-P3-20: Withdrawn / Cancelled Question in Scoring
- **Attack / Failure:** High Court orders Q.15 dropped due to typographic ambiguity.
- **Invariant Tested:** `P3-I07` (Deterministic Scoring Rules).
- **Expected System Behavior:** Policy marks Q.15 as `disposition: FULL_MARKS_AWARDED` or `DROPPED_CANCELLED`; rescales scores deterministically.
- **Authoritative Component:** Scoring Evaluator.
- **Recovery Behavior:** New evaluation run recorded.
- **Audit Evidence:** Statutory audit report generated.

### SCEN-P3-21: Attempt Against Superseded Package
- **Attack / Failure:** Session launched against Package v1 after Package v2 was published.
- **Invariant Tested:** `P3-I02` & `P3-I04` (Package Version Pinning).
- **Expected System Behavior:** Session pinned to v1 evaluates against v1; historical integrity preserved. New sessions provisioned against v2.
- **Authoritative Component:** Session Orchestrator & Scoring Engine.
- **Recovery Behavior:** Both versions evaluate independently.
- **Audit Evidence:** Version audit log verified.

### SCEN-P3-22: Tampered Asset Binary in Object Storage
- **Attack / Failure:** Attacker alters question diagram image in S3 bucket.
- **Invariant Tested:** `P3-I11` (Asset Integrity).
- **Expected System Behavior:** CDN / Edge gateway recomputes SHA-256 hash; hash differs from content-addressed ID; returns HTTP 502 Bad Gateway; alerts security.
- **Authoritative Component:** Asset Delivery Gateway.
- **Recovery Behavior:** Fallback to immutable cold storage replica.
- **Audit Evidence:** Security alert `ASSET_INTEGRITY_TAMPER_DETECTED`.

### SCEN-P3-23: Missing Asset Binary
- **Attack / Failure:** Asset deleted from primary storage.
- **Invariant Tested:** `P3-I11` (Asset Durability).
- **Expected System Behavior:** System triggers automated restoration from Phase 2D-8 content-addressed backup store; player displays retryable placeholder.
- **Authoritative Component:** Content-Addressed Asset Subsystem.
- **Recovery Behavior:** Asset self-heals from canonical archive.
- **Audit Evidence:** Storage error log `ASSET_RESTORE_TRIGGERED`.

### SCEN-P3-24: CDN Cache Poisoning Attempt
- **Attack / Failure:** Attacker attempts HTTP request smuggling to overwrite cached question projection.
- **Invariant Tested:** `P3-I14` (Projection Isolation).
- **Expected System Behavior:** Cloudflare / CDN enforces strict TLS 1.3 origin verification; projections sealed with SHA-256 integrity tags.
- **Authoritative Component:** Edge CDN Layer.
- **Recovery Behavior:** Smuggled request rejected.
- **Audit Evidence:** Edge WAF security log.

### SCEN-P3-25: Race Condition on Package Publication
- **Attack / Failure:** Two administrators trigger publication of identical package simultaneously.
- **Invariant Tested:** `P3-I03` (Publication Idempotency).
- **Expected System Behavior:** Phase 2D-8 publication gateway serializes via row lock and `publicationRequestFingerprint`; first succeeds, second returns identical record.
- **Authoritative Component:** Publication Gateway.
- **Recovery Behavior:** Single canonical publication event created.
- **Audit Evidence:** Gateway idempotency log verified.

### SCEN-P3-26: Database Transaction Rollback on Submission
- **Attack / Failure:** Database triggers fail or disk fills during submission append.
- **Invariant Tested:** `P3-I06` (ACID Transaction Integrity).
- **Expected System Behavior:** Transaction rolls back completely; gateway returns HTTP 500; zero partial rows persisted.
- **Authoritative Component:** PostgreSQL Transaction Manager.
- **Recovery Behavior:** Client retries safely when database healthy.
- **Audit Evidence:** Database rollback metric incremented.

### SCEN-P3-27: Primary Database Failover Mid-Exam
- **Attack / Failure:** Primary PostgreSQL node crashes; standby promoted to primary.
- **Invariant Tested:** `P3-I06` (Ledger Durability).
- **Expected System Behavior:** Synchronous replication guarantees zero committed event loss; connection pool reconnects to new primary in $< 5$s.
- **Authoritative Component:** High-Availability Cluster (Patroni / Supabase HA).
- **Recovery Behavior:** Client retries buffered events seamlessly.
- **Audit Evidence:** Failover cluster log recorded.

### SCEN-P3-28: Worker Process Crash Mid-Ingestion
- **Attack / Failure:** Node.js / Go worker process segfaults while processing submission.
- **Invariant Tested:** `P3-I06` (Crash Resilience).
- **Expected System Behavior:** TCP connection resets; uncommitted transaction terminates; client receives network error and retries with same event ID.
- **Authoritative Component:** Container Orchestrator (Kubernetes).
- **Recovery Behavior:** Pod restarts; client retry succeeds on neighboring pod.
- **Audit Evidence:** Container restart event logged.

### SCEN-P3-29: Queue Message Duplication (Kafka / Redis Streams)
- **Attack / Failure:** Message broker delivers scoring job message twice.
- **Invariant Tested:** `P3-I07` (Scoring Evaluation Idempotency).
- **Expected System Behavior:** Scoring worker checks unique constraint on `(exam_session_id, run_iteration)`; ignores duplicate job cleanly.
- **Authoritative Component:** Scoring Evaluation Worker.
- **Recovery Behavior:** Single evaluation record created.
- **Audit Evidence:** Worker log `DUPLICATE_SCORING_JOB_SKIPPED`.

### SCEN-P3-30: Queue Message Reordering
- **Attack / Failure:** Session submit message arrives at scoring worker before some buffered submission events.
- **Invariant Tested:** `P3-I07` (Evaluation Completeness).
- **Expected System Behavior:** Worker validates that `clientSequenceNumber` has zero gaps based on final session manifest before initiating scoring.
- **Authoritative Component:** Scoring Pre-Flight Validator.
- **Recovery Behavior:** Job delayed until ingestion stream reconciles.
- **Audit Evidence:** Scoring pre-flight log recorded.

### SCEN-P3-31: Partial Database Batch Insertion Failure
- **Attack / Failure:** Batch of 10 events has 1 invalid question ID on event 7.
- **Invariant Tested:** `P3-I06` (All-or-Nothing Batch Atomicity).
- **Expected System Behavior:** Transaction rolls back all 10 events; returns HTTP 422 with failing event ID; zero events written.
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Client isolates and purges invalid event, then re-submits valid 9.
- **Audit Evidence:** Batch validation error log.

### SCEN-P3-32: Malformed Response Payload Structure
- **Attack / Failure:** Attacker sends `{ "selectedOptionId": 12345 }` (integer instead of UUID string).
- **Invariant Tested:** `P3-I06` (Schema Strictness).
- **Expected System Behavior:** Schema validator rejects at gateway boundary with HTTP 400 Bad Request; zero database execution.
- **Authoritative Component:** JSON Schema Validator.
- **Recovery Behavior:** Rejection returned immediately.
- **Audit Evidence:** Validation failure logged.

### SCEN-P3-33: Oversized Payload Injection (DoS Attack)
- **Attack / Failure:** Attacker posts a 50MB string inside `candidateResponse`.
- **Invariant Tested:** `P3-I06` (Payload Size Governance).
- **Expected System Behavior:** Reverse proxy (Nginx) rejects payload exceeding 64KB with HTTP 413 Payload Too Large.
- **Authoritative Component:** Edge Reverse Proxy.
- **Recovery Behavior:** Dropped at socket boundary.
- **Audit Evidence:** Nginx access log records 413.

### SCEN-P3-34: Submission Schema Version Mismatch
- **Attack / Failure:** Outdated client app sends deprecated submission schema.
- **Invariant Tested:** `P3-I06` (API Versioning).
- **Expected System Behavior:** Gateway rejects with HTTP 426 Upgrade Required (`E_UNSUPPORTED_CLIENT_SCHEMA`).
- **Authoritative Component:** Ingestion Gateway.
- **Recovery Behavior:** Client prompted to refresh app.
- **Audit Evidence:** Telemetry counter `CLIENT_SCHEMA_OBSOLETE`.

### SCEN-P3-35: Authorization Role Downgrade Attempt
- **Attack / Failure:** Staff token downgraded or candidate claims moderator scope.
- **Invariant Tested:** `P3-I08` & `P3-I09` (Role-Based Access Control).
- **Expected System Behavior:** Gateway cryptographically validates JWT role claim; rejects unauthorized route with HTTP 403.
- **Authoritative Component:** Auth Gateway.
- **Recovery Behavior:** Request fails closed.
- **Audit Evidence:** Security log `UNAUTHORIZED_ROLE_ACCESS`.

### SCEN-P3-36: Privilege Escalation to Admin Endpoint
- **Attack / Failure:** Candidate attempts `POST /api/v1/packages/{id}/publish`.
- **Invariant Tested:** `P3-I09` (Staff Isolation).
- **Expected System Behavior:** Endpoint protected behind internal VPC and administrative role filter; rejects with HTTP 403 Forbidden.
- **Authoritative Component:** API Gateway.
- **Recovery Behavior:** Request terminated.
- **Audit Evidence:** Critical audit event `ADMIN_ENDPOINT_PROBE_DENIED`.

### SCEN-P3-37: Guessing Session UUIDs (Enumeration Attack)
- **Attack / Failure:** Script attempts brute-force GET requests against `/sessions/{uuid}`.
- **Invariant Tested:** `P3-I09` (Entropy & IDOR Protection).
- **Expected System Behavior:** UUIDv7 space ($2^{128}$) renders brute-force impossible; rate limiter triggers IP ban after 20 404s.
- **Authoritative Component:** Edge Rate Limiter & Gateway.
- **Recovery Behavior:** IP blacklisted for 60 minutes.
- **Audit Evidence:** WAF alert `BRUTE_FORCE_ENUMERATION_BLOCKED`.

### SCEN-P3-38: Session Fixation Attack
- **Attack / Failure:** Attacker supplies pre-crafted session ID in login URL.
- **Invariant Tested:** `P3-I04` (Session Generation Authority).
- **Expected System Behavior:** Server ignores client-supplied session ID; generates fresh cryptographically secure UUIDv7 upon authentication.
- **Authoritative Component:** Auth Gateway.
- **Recovery Behavior:** New session instantiated.
- **Audit Evidence:** Auth event logged.

### SCEN-P3-39: Replay of Expired JWT Token
- **Attack / Failure:** Attacker uses captured session token 4 hours after exam completed.
- **Invariant Tested:** `P3-I04` (Token Expiry Governance).
- **Expected System Behavior:** JWT signature validation checks `exp` claim; rejects with HTTP 401 Unauthorized (`E_TOKEN_EXPIRED`).
- **Authoritative Component:** API Gateway.
- **Recovery Behavior:** Access denied.
- **Audit Evidence:** Auth metric `TOKEN_EXPIRED_REJECTED`.

### SCEN-P3-40: 10-Year Historical Result Reconstruction Audit
- **Attack / Failure:** Legal inquiry demands bit-for-bit reconstruction of a 2026 candidate's score in 2036.
- **Invariant Tested:** `P3-I10` (Permanent Historical Reproducibility).
- **Expected System Behavior:** Server retrieves frozen `AttemptSnapshot`, `packageIntegritySeal`, `ScoringPolicyVersion`, and `AnswerKeyVersion`; runs deterministic evaluation function; produces identical `totalScore` and `evaluationSignature`.
- **Authoritative Component:** Historical Audit Evaluator.
- **Recovery Behavior:** Verifiable cryptographic match confirmed.
- **Audit Evidence:** Formal certification of deterministic reproduction issued.
