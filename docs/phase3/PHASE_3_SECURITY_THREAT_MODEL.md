# UADUE Phase 3 — Security Architecture & Threat Model
**Document ID:** `UADUE-P3-SEC-009`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Threat Modeling & Defense-in-Depth Specification  

---

## 1. Executive Summary & Security Philosophy

The UADUE Phase 3 examination delivery system handles high-stakes, nationally standardized competitive examinations. Security is not treated as a peripheral layer or an afterthought; it is woven into every state machine, submission event, and data projection.

**Core Philosophy:** *Zero Trust in Client Devices.* The candidate's browser, network connection, device clock, and memory space are treated as hostile environments. The server maintains total authority over correctness, timing, eligibility, and scoring.

---

## 2. STRIDE Threat Analysis Matrix

The table below provides a comprehensive STRIDE classification of threats targeting examination delivery:

| Threat Category | Specific Threat Scenario | Affected Component | Impact / Risk | Phase 3 Mitigations & Defensive Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Candidate spoofs another candidate's session ID to submit fake answers or drain timer. | Submission Gateway | Critical (Candidate Compromise) | Session tokens are cryptographically signed JWTs bound to `(tenantId, candidateId, examSessionId)` with short TTL; checked via PostgreSQL RLS. |
| **Spoofing** | Attacker impersonates platform staff to access unreleased packages or answer keys. | Staff Gateway | Critical (Exam Leakage) | Multi-Factor Authentication (MFA), role-based claims verification, hardware token auth for staff endpoints. |
| **Tampering** | Candidate modifies submission payload to change `canonicalQuestionId` or `markingScheme`. | Ingestion Pipeline | High (Data Corruption) | Strict JSON Schema validation; marking scheme and answer evaluation are server-side only; package integrity seal verified. |
| **Tampering** | Local storage tampering to manipulate test state or question text. | Player UI / IndexedDB | Low | Local cache is non-authoritative; all renders derive from server-verified signed envelopes. |
| **Tampering** | Man-in-the-Middle tampers with in-flight answers. | Network Transport | Critical (Data Manipulation) | Mandatory TLS 1.3 with certificate pinning on mobile/desktop wrappers; payload checksums verified. |
| **Repudiation** | Candidate claims an answer was submitted when server has no record; or claims server changed answer. | Submission Ledger | Critical (Legal / Trust Failure) | Dual cryptographic submission receipts signed with server private key; immutable append-only event stream; non-repudiable logs. |
| **Information Disclosure** | Live answer keys leaked via browser memory, devtools, or network inspection. | Projection Engine | Fatal (Exam Integrity Voided) | Tier 3 projection strictly strips answer keys, candidate resolutions, solutions, and scoring formulas before JSON serialization (P3-I08). |
| **Information Disclosure** | Candidate enumerates IDs of other candidates, sessions, or packages via incremental IDs. | All REST APIs | High (Privacy Breach) | Global enforcement of UUIDv7 identifiers; sequential IDs strictly forbidden in external URLs. |
| **Information Disclosure** | Leakage of proprietary question images via unprotected CDN URLs. | Asset Delivery | High (Copyright / Leakage) | Assets delivered via short-lived (15 min) signed URLs bound to session IP/subnet and tenant ID; hotlink prevention. |
| **Denial of Service** | Botnet floods submission endpoint at peak exam close (thundering herd). | Ingestion Gateway | Fatal (System Outage) | Rate limiting per session token; asynchronous queue decoupling; connection pooling; edge caching of static assets. |
| **Denial of Service** | Rapid WebSocket reconnection storm during network flap. | Real-time Gateway | High (Gateway Exhaustion) | Exponential backoff with jitter on client reconnects; strict connection concurrency limits per tenant. |
| **Elevation of Privilege** | Candidate manipulates JWT claims to elevate to Proctor/Staff role. | Auth Gateway | Fatal (Administrative Takeover) | Staff endpoints segregated behind separate VPC / Gateway; cryptographically isolated signing keys for staff vs student tokens. |
| **Elevation of Privilege** | Cross-tenant data leak: Candidate from Organization A queries session of Organization B. | PostgreSQL Database | Critical (Multi-Tenant Breach) | PostgreSQL Row-Level Security (RLS) enforced on all session, submission, and result tables using `tenant_id` session variables. |

---

## 3. Granular Threat Boundaries & Architectural Mitigations

### 3.1 Answer Key Leakage Prevention (Information Barrier)
- **Problem:** Conventional assessment apps send the full exam JSON (including `correctAnswer: 'A'`) to the browser, hiding it with CSS or client-side JavaScript. Savvy candidates open Chrome DevTools and extract answer keys instantly.
- **Phase 3 Enforcement:**
  - The Tier 3 projection engine runs on the server before serialization.
  - Fields such as `authoritativeAnswer`, `answerResolutionGraph`, `solutionText`, and `corrigendum` do not exist in the Tier 3 serializer schema.
  - No code or metadata related to correct answers is ever emitted over the wire during the active session.

### 3.2 Insecure Direct Object Reference (IDOR) & UUIDv7 Identity
- **Problem:** Predictable sequential IDs (e.g., `/sessions/10042/submit`) enable horizontal privilege escalation.
- **Phase 3 Enforcement:**
  - All public resource identifiers are cryptographically random UUIDv7 strings.
  - Every API request validates that `token.candidateId == session.candidateId` AND `token.tenantId == session.tenantId`.
  - Database queries use row-level conditions: `WHERE id = $id AND tenant_id = current_setting('app.current_tenant_id')`.

### 3.3 Replay & Malicious Client Clock Manipulation
- **Problem:** Candidate sets system clock back by 2 hours to continue answering after time expires, or replays recorded network packets.
- **Phase 3 Enforcement:**
  - The server timer is the sole arbiter of time. The server countdown is calculated as:
    $$\text{RemainingSeconds} = \text{DurationSeconds} - (\text{ServerCurrentTime} - \text{SessionStartTime})$$
  - Client timestamps sent in submission payloads are recorded purely for network latency telemetry.
  - Every submission carries a unique `clientEventId`. Duplicate packets with matching event IDs are de-duplicated idempotently and do not alter state.

### 3.4 Multi-Device & Session Fixation Protection
- **Problem:** A candidate opens the exam on Device A while a collaborator attempts answers simultaneously on Device B.
- **Phase 3 Enforcement:**
  - **Single Active Lease Policy:** Every session maintains a `currentLeaseId` (UUIDv7) and `leaseHeartbeatTimestamp`.
  - Logging in from a new device generates a new `leaseId` and revokes previous leases.
  - Submissions carrying an invalidated lease token are rejected with `401 Unauthorized (E_LEASE_REVOKED)`.

### 3.5 Content Security Policy (CSP) & Web Security Headers
Exam Player web delivery must enforce strict HTTP headers to eliminate XSS, clickjacking, and script injection:
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.uadue.mockai.internal data:; font-src 'self'; connect-src 'self' wss://ws.uadue.mockai.internal; frame-ancestors 'none';`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 4. Threat Model Summary Table

| Category | Primary Defense Mechanism | Verification Method |
| :--- | :--- | :--- |
| **Authentication** | Ephemeral, signed JWTs with candidate and tenant binding | Cryptographic signature validation |
| **Authorization** | Multi-tiered RLS & role-scoped projection filters | Unit & adversarial integration tests |
| **Data Integrity** | Content-addressed SHA-256 seals & dual receipts | Hash verification at every stage |
| **Availability** | Decoupled asynchronous ingestion queues & rate limiters | Load & stress testing (1k to 1M) |
| **Non-Repudiation** | Monotonic append-only event streams & signed receipts | Audit log traceability checks |
