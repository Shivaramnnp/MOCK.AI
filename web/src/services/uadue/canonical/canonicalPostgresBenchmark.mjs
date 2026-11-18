// src/services/uadue/canonical/canonicalPostgresBenchmark.ts
import { Pool as Pool2 } from "pg";

// src/services/uadue/canonical/canonicalPostgresPersistenceAdapter.ts
import { Pool } from "pg";
import { createHmac } from "crypto";

// src/services/uadue/canonical/canonicalLifecycleEngine.ts
var InvalidLifecycleTransitionError = class extends Error {
  constructor(currentState, eventType, details) {
    super(`Lifecycle Violation: Cannot transition from ${currentState} via ${eventType}: ${details}`);
    this.currentState = currentState;
    this.eventType = eventType;
    this.details = details;
    this.name = "InvalidLifecycleTransitionError";
  }
};
var CorruptedEventStreamError = class extends Error {
  constructor(packageId, details) {
    super(`Corrupted Event Stream for package ${packageId}: ${details}`);
    this.packageId = packageId;
    this.name = "CorruptedEventStreamError";
  }
};
function applyLifecycleTransition(currentState, event, quarantineOrigin) {
  const { eventType, eventPayload } = event;
  switch (currentState) {
    case "DRAFT": {
      if (eventType === "PERSISTENCE_COMMITTED") {
        return { nextState: "PERSISTED", nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "Only PERSISTENCE_COMMITTED can transition a DRAFT package envelope."
      );
    }
    case "PERSISTED": {
      if (eventType === "VALIDATION_RECORDED") {
        const status = eventPayload.validationStatus;
        if (status === "PACKAGE_VALIDATED") {
          return { nextState: "VALIDATED", nextQuarantineOrigin: null };
        } else {
          return { nextState: "QUARANTINED", nextQuarantineOrigin: "PERSISTED" };
        }
      }
      if (eventType === "SUPERSESSION_REGISTERED") {
        return { nextState: "SUPERSEDED", nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "PERSISTED packages can only transition via VALIDATION_RECORDED or SUPERSESSION_REGISTERED."
      );
    }
    case "VALIDATED": {
      if (eventType === "PUBLICATION_ISSUED") {
        return { nextState: "PUBLISHED", nextQuarantineOrigin: null };
      }
      if (eventType === "QUARANTINE_APPLIED") {
        return { nextState: "QUARANTINED", nextQuarantineOrigin: "VALIDATED" };
      }
      if (eventType === "SUPERSESSION_REGISTERED") {
        return { nextState: "SUPERSEDED", nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "VALIDATED packages can only transition via PUBLICATION_ISSUED, QUARANTINE_APPLIED, or SUPERSESSION_REGISTERED."
      );
    }
    case "PUBLISHED": {
      if (eventType === "QUARANTINE_APPLIED") {
        return { nextState: "QUARANTINED", nextQuarantineOrigin: "PUBLISHED" };
      }
      if (eventType === "SUPERSESSION_REGISTERED") {
        return { nextState: "SUPERSEDED", nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "PUBLISHED packages can only transition via QUARANTINE_APPLIED or SUPERSESSION_REGISTERED."
      );
    }
    case "QUARANTINED": {
      if (eventType === "QUARANTINE_RELEASED") {
        if (quarantineOrigin === "PERSISTED") {
          throw new InvalidLifecycleTransitionError(
            currentState,
            eventType,
            "Option A Violation: Validation-failure quarantine (origin=PERSISTED) is strictly irreversible and cannot be released. May only transition to SUPERSEDED."
          );
        }
        if (quarantineOrigin === "VALIDATED") {
          return { nextState: "VALIDATED", nextQuarantineOrigin: null };
        }
        if (quarantineOrigin === "PUBLISHED") {
          return { nextState: "PUBLISHED", nextQuarantineOrigin: null };
        }
        throw new InvalidLifecycleTransitionError(
          currentState,
          eventType,
          "Cannot release quarantine without a valid recorded origin (VALIDATED or PUBLISHED)."
        );
      }
      if (eventType === "SUPERSESSION_REGISTERED") {
        return { nextState: "SUPERSEDED", nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "QUARANTINED packages can only transition via QUARANTINE_RELEASED or SUPERSESSION_REGISTERED."
      );
    }
    case "SUPERSEDED": {
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        "SUPERSEDED is strictly a terminal state. No subsequent transitions are permitted."
      );
    }
    default: {
      const _exhaustiveCheck = currentState;
      throw new Error(`Unhandled lifecycle state: ${_exhaustiveCheck}`);
    }
  }
}
function reducePackageLifecycle(events, packageId) {
  if (events.length === 0) {
    return "DRAFT";
  }
  const sortedEvents = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let state = "DRAFT";
  let quarantineOrigin = null;
  let expectedSeq = 1;
  for (const event of sortedEvents) {
    if (event.sequenceNumber !== expectedSeq) {
      throw new CorruptedEventStreamError(
        packageId || event.packageId,
        `Sequence gap or duplication detected. Expected ${expectedSeq}, encountered ${event.sequenceNumber}.`
      );
    }
    try {
      const result = applyLifecycleTransition(state, event, quarantineOrigin);
      state = result.nextState;
      quarantineOrigin = result.nextQuarantineOrigin;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CorruptedEventStreamError(packageId || event.packageId, msg);
    }
    expectedSeq++;
  }
  return state;
}

// src/services/uadue/canonical/canonicalHashing.ts
import { createHash } from "crypto";
function rfc8785Canonicalize(val) {
  if (val === null) {
    return "null";
  }
  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error(`RFC 8785 forbids non-finite numbers: ${val}`);
    }
    if (Object.is(-0, val) || val === 0) {
      return "0";
    }
    return JSON.stringify(val);
  }
  if (typeof val === "string") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const serializedElements = val.map((item) => {
      if (item === void 0) {
        return "null";
      }
      return rfc8785Canonicalize(item);
    });
    return `[${serializedElements.join(",")}]`;
  }
  if (typeof val === "object") {
    const obj = val;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = [];
    for (const key of sortedKeys) {
      const propVal = obj[key];
      if (propVal !== void 0) {
        pairs.push(`${JSON.stringify(key)}:${rfc8785Canonicalize(propVal)}`);
      }
    }
    return `{${pairs.join(",")}}`;
  }
  throw new Error(`Unsupported type for RFC 8785 canonicalization: ${typeof val}`);
}
function domainCanonicalize(val) {
  if (val === null || val === void 0 || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => domainCanonicalize(item));
  }
  const obj = val;
  const normalized = {};
  for (const [key, propVal] of Object.entries(obj)) {
    if (propVal === void 0) {
      continue;
    }
    if (key === "userSelectedOptionIds" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === "correctOptionLabels" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === "correctOptionIds" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === "conflictingVersionIds" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === "resolvedConflictHeadVersionIds" && Array.isArray(propVal)) {
      normalized[key] = [...new Set(propVal.map(String))].sort();
    } else if (key === "targetLabels" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === "requiredTraits" && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else {
      normalized[key] = domainCanonicalize(propVal);
    }
  }
  return normalized;
}
function computeCanonicalSha256(domainPrefix, payload) {
  const domainNormalized = domainCanonicalize(payload);
  const jcsString = rfc8785Canonicalize(domainNormalized);
  return createHash("sha256").update(`${domainPrefix}:${jcsString}`, "utf8").digest("hex");
}
function deriveConflictId(input) {
  return computeCanonicalSha256("conflict", {
    conflictingVersionIds: input.conflictingVersionIds,
    resolutionFamilyId: input.resolutionFamilyId
  });
}
function derivePackageId(input) {
  return computeCanonicalSha256("canonical_package", {
    canonicalQuestionIds: [...input.canonicalQuestionIds].sort(),
    logicalFamilyIds: [...input.logicalFamilyIds].sort(),
    membershipIds: [...input.membershipIds].sort(),
    pipelineAlgorithmId: input.pipelineAlgorithmId,
    pipelineAlgorithmVersion: input.pipelineAlgorithmVersion,
    quarantinedRelationshipIds: input.quarantinedRelationshipIds ? [...input.quarantinedRelationshipIds].sort() : [],
    relationshipEvaluationIds: [...input.relationshipEvaluationIds].sort(),
    schemaVersion: input.schemaVersion,
    sourceDocumentId: input.sourceDocumentId,
    sourceSnapshotId: input.sourceSnapshotId
  });
}
function computePackageIntegritySeal(input) {
  const contentPayload = {
    authoritativeAnswers: Object.entries(input.authoritativeAnswers).map(([qid, res]) => ({
      authoritativeResolutionId: res.authoritativeResolution?.resolutionVersionId ?? null,
      candidateAnswerId: res.authoritativeResolution?.candidateAnswerId ?? null,
      canonicalQuestionId: qid,
      competingVersionIds: res.competingResolutionVersions ? res.competingResolutionVersions.map((v) => v.resolutionVersionId).sort() : [],
      status: res.status
    })).sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId)),
    canonicalQuestions: input.canonicalQuestions.map((q) => ({
      canonicalFingerprint: q.canonicalFingerprint,
      canonicalQuestionId: q.canonicalQuestionId,
      familyRole: q.familyRole,
      logicalFamilyId: q.logicalFamilyId,
      representations: q.representations.map((r) => ({
        diagrams: r.diagrams,
        languageScript: r.languageScript,
        mathBlocks: r.mathBlocks,
        options: r.options,
        representationId: r.representationId,
        sourcePhysicalInstanceId: r.sourcePhysicalInstanceId,
        sourceQuestionNumber: r.sourceQuestionNumber ?? null,
        stemAST: r.stemAST,
        tables: r.tables
      })),
      sourceDiscrepancies: q.sourceDiscrepancies,
      synthesizedQuestionType: q.synthesizedQuestionType
    })),
    logicalFamilies: input.logicalFamilies.map((f) => ({
      familyAnchorPhysicalInstanceId: f.familyAnchorPhysicalInstanceId,
      familyId: f.familyId,
      familyType: f.familyType,
      members: f.members
    })),
    memberships: input.memberships.map((m) => ({
      candidatePhysicalInstanceId: m.candidatePhysicalInstanceId,
      familyCandidateId: m.familyCandidateId,
      membershipFingerprint: m.membershipFingerprint,
      role: m.role,
      verificationStatus: m.verificationStatus
    })),
    packageId: input.packageId,
    pipelineAlgorithmId: input.pipelineAlgorithmId,
    pipelineAlgorithmVersion: input.pipelineAlgorithmVersion,
    quarantinedRelationships: input.quarantinedRelationships.map((qr) => ({
      quarantineReason: qr.quarantineReason,
      relationshipId: qr.relationshipId,
      relationshipType: qr.relationshipType,
      sourceCandidateId: qr.sourceCandidateId,
      targetCandidateId: qr.targetCandidateId
    })),
    relationshipEvaluations: input.relationshipEvaluations.map((r) => ({
      evaluationId: r.evaluationId,
      relationshipType: r.relationshipType,
      sourcePhysicalInstanceId: r.sourcePhysicalInstanceId,
      targetPhysicalInstanceId: r.targetPhysicalInstanceId,
      verificationStatus: r.verificationStatus
    })),
    schemaVersion: input.schemaVersion,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceSnapshotId: input.sourceSnapshotId ?? null
  };
  return computeCanonicalSha256("pkg_integrity_seal", contentPayload);
}

// src/services/uadue/canonical/canonicalPublicationGateway.ts
var PublicationConflictError = class extends Error {
  constructor(packageId, details) {
    super(`Publication Conflict (409) for package ${packageId}: ${details}`);
    this.packageId = packageId;
    this.name = "PublicationConflictError";
  }
  status = 409;
};
function computePublicationRequestFingerprint(req) {
  return computeCanonicalSha256("pub_req", {
    packageId: req.packageId,
    packageIntegritySeal: req.packageIntegritySeal,
    publicationAuthorityId: req.publicationAuthorityId,
    targetScope: req.targetScope,
    publicationPolicyConfig: req.publicationPolicyConfig ?? {}
  });
}

// src/services/uadue/canonical/canonicalPostgresPersistenceAdapter.ts
var PersistenceIntegrityError = class extends Error {
  constructor(packageId, details) {
    super(`Persistence Integrity Violation for package ${packageId}: ${details}`);
    this.packageId = packageId;
    this.name = "PersistenceIntegrityError";
  }
};
var TableConstraintError = class extends Error {
  constructor(constraintName, details) {
    super(`Table Constraint Violation [${constraintName}]: ${details}`);
    this.constraintName = constraintName;
    this.name = "TableConstraintError";
  }
};
var ImmutabilityViolationError = class extends Error {
  constructor(tableName, operation) {
    super(`Immutability Violation: Cannot perform ${operation} on append-only table ${tableName}.`);
    this.tableName = tableName;
    this.operation = operation;
    this.name = "ImmutabilityViolationError";
  }
};
var TenancyAccessError = class extends Error {
  constructor(message) {
    super(`Tenancy Access Violation: ${message}`);
    this.name = "TenancyAccessError";
  }
};
var CanonicalPostgresPersistenceAdapter = class {
  pool;
  serviceSigningSecret;
  constructor(config, serviceSigningSecret = "uadue-phase2d8-default-hmac-secret-key-32b") {
    if (config instanceof Pool) {
      this.pool = config;
    } else {
      this.pool = new Pool({
        host: config.host || "localhost",
        port: config.port || 5432,
        database: config.database || "mockai_uadue_test",
        user: config.user || process.env.USER || "postgres",
        password: config.password,
        max: config.max || 20,
        ssl: config.ssl ? config.ssl : false
      });
    }
    this.serviceSigningSecret = serviceSigningSecret;
  }
  getPool() {
    return this.pool;
  }
  async close() {
    await this.pool.end();
  }
  // ==========================================================================
  // 1. Transactional Package Ingestion & Pre-Commit Dual-Seal Audit
  // ==========================================================================
  async persistPackage(pkg, tenantContext) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setSessionContext(client, tenantContext?.tenantId, true);
      const existingCheck = await client.query(
        "SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1",
        [pkg.packageId]
      );
      if (existingCheck.rows.length > 0) {
        throw new TableConstraintError(
          "pk_canonical_assessment_packages",
          `Package with ID ${pkg.packageId} is already persisted. In-place re-persistence is forbidden.`
        );
      }
      await client.query(
        `INSERT INTO public.canonical_assessment_packages
          (package_id, source_snapshot_id, source_document_id, package_integrity_seal, schema_version, pipeline_algorithm_id, pipeline_algorithm_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pkg.packageId,
          pkg.sourceSnapshotId,
          pkg.sourceDocumentId,
          pkg.packageIntegritySeal,
          pkg.schemaVersion,
          pkg.pipelineAlgorithmId,
          pkg.pipelineAlgorithmVersion
        ]
      );
      for (let qIndex = 0; qIndex < pkg.canonicalQuestions.length; qIndex++) {
        const q = pkg.canonicalQuestions[qIndex];
        await client.query(
          `INSERT INTO public.canonical_questions
            (package_id, canonical_question_id, question_index, logical_family_id, family_role, synthesized_question_type, canonical_fingerprint, source_discrepancies)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            pkg.packageId,
            q.canonicalQuestionId,
            qIndex,
            q.logicalFamilyId,
            q.familyRole ?? null,
            q.synthesizedQuestionType ?? null,
            q.canonicalFingerprint,
            JSON.stringify(q.sourceDiscrepancies || [])
          ]
        );
        for (let repIndex = 0; repIndex < q.representations.length; repIndex++) {
          const rep = q.representations[repIndex];
          await client.query(
            `INSERT INTO public.canonical_question_representations
              (package_id, canonical_question_id, representation_index, representation_id, language_script, source_physical_instance_id, source_question_number, stem_ast, options, tables, diagrams, math_blocks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              pkg.packageId,
              q.canonicalQuestionId,
              repIndex,
              rep.representationId,
              rep.languageScript ?? "UNIVERSAL",
              rep.sourcePhysicalInstanceId,
              rep.sourceQuestionNumber ?? null,
              JSON.stringify(rep.stemAST || []),
              JSON.stringify(rep.options || []),
              rep.tables !== void 0 ? JSON.stringify(rep.tables) : null,
              rep.diagrams !== void 0 ? JSON.stringify(rep.diagrams) : null,
              rep.mathBlocks !== void 0 ? JSON.stringify(rep.mathBlocks) : null
            ]
          );
        }
      }
      for (const fam of pkg.logicalFamilies) {
        await client.query(
          `INSERT INTO public.canonical_logical_families
            (package_id, family_id, family_type, family_anchor_physical_instance_id, members)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            pkg.packageId,
            fam.familyId,
            fam.familyType ?? null,
            fam.familyAnchorPhysicalInstanceId ?? null,
            JSON.stringify(fam.members || [])
          ]
        );
      }
      for (const ev of pkg.relationshipEvaluations) {
        await client.query(
          `INSERT INTO public.canonical_relationship_evaluations
            (package_id, evaluation_id, relationship_type, source_candidate_id, target_candidate_id, source_physical_instance_id, target_physical_instance_id, confidence_score, verification_status, evidence_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            pkg.packageId,
            ev.evaluationId,
            ev.relationshipType,
            ev.sourceCandidateId,
            ev.targetCandidateId,
            ev.sourcePhysicalInstanceId,
            ev.targetPhysicalInstanceId,
            ev.confidenceScore,
            ev.verificationStatus,
            JSON.stringify(ev.allEvidence || [])
          ]
        );
      }
      for (const mem of pkg.memberships) {
        await client.query(
          `INSERT INTO public.canonical_family_memberships
            (package_id, membership_fingerprint, family_candidate_id, candidate_physical_instance_id, role, verification_status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pkg.packageId,
            mem.membershipFingerprint,
            mem.familyCandidateId,
            mem.candidatePhysicalInstanceId,
            mem.role ?? null,
            mem.verificationStatus
          ]
        );
      }
      for (const qRel of pkg.quarantinedRelationships) {
        await client.query(
          `INSERT INTO public.canonical_quarantined_relationships
            (package_id, relationship_id, source_candidate_id, target_candidate_id, relationship_type, quarantine_reason, quarantined_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            pkg.packageId,
            qRel.relationshipId,
            qRel.sourceCandidateId ?? null,
            qRel.targetCandidateId ?? null,
            qRel.relationshipType ?? null,
            qRel.quarantineReason ?? null,
            qRel.quarantinedAt ?? null
          ]
        );
      }
      for (const [qid, ans] of Object.entries(pkg.authoritativeAnswers)) {
        await client.query(
          `INSERT INTO public.canonical_answer_authority_resolutions
            (package_id, canonical_question_id, resolution_payload)
           VALUES ($1, $2, $3)`,
          [pkg.packageId, qid, JSON.stringify(ans || {})]
        );
      }
      const tenantId = tenantContext?.tenantId || "system_master";
      const orgId = tenantContext?.organizationId || "system_org";
      const visibility = tenantContext?.visibilityScope || "PUBLIC";
      await client.query(
        `INSERT INTO public.canonical_package_tenancy
          (package_id, tenant_id, organization_id, visibility_scope)
         VALUES ($1, $2, $3, $4)`,
        [pkg.packageId, tenantId, orgId, visibility]
      );
      const reconstructed = await this.reconstructPackageInternalWithClient(client, pkg.packageId, pkg.validationReport);
      const derivedId = derivePackageId({
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestionIds: reconstructed.canonicalQuestions.map((q) => q.canonicalQuestionId),
        logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
        membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion
      });
      const derivedSeal = computePackageIntegritySeal({
        packageId: reconstructed.packageId,
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestions: reconstructed.canonicalQuestions,
        logicalFamilies: reconstructed.logicalFamilies,
        relationshipEvaluations: reconstructed.relationshipEvaluations,
        memberships: reconstructed.memberships,
        quarantinedRelationships: reconstructed.quarantinedRelationships,
        authoritativeAnswers: reconstructed.authoritativeAnswers,
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion
      });
      if (derivedId !== pkg.packageId) {
        await client.query("ROLLBACK");
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit identity mismatch! Expected ${pkg.packageId}, reconstructed derivedId ${derivedId}.`
        );
      }
      if (derivedSeal !== pkg.packageIntegritySeal) {
        await client.query("ROLLBACK");
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit content seal mismatch! Expected ${pkg.packageIntegritySeal}, reconstructed derivedSeal ${derivedSeal}.`
        );
      }
      const persistEventId = `evt_persist_${pkg.packageId}_1`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          persistEventId,
          pkg.packageId,
          1,
          "PERSISTENCE_COMMITTED",
          null,
          JSON.stringify({
            schemaVersion: pkg.schemaVersion,
            questionCount: pkg.canonicalQuestions.length,
            persistedAt: Date.now()
          })
        ]
      );
      const valEventId = `evt_val_${pkg.packageId}_2`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          valEventId,
          pkg.packageId,
          2,
          "VALIDATION_RECORDED",
          null,
          JSON.stringify({
            validationStatus: pkg.validationReport.validationStatus,
            validationFingerprint: pkg.validationReport.validationFingerprint,
            passedInvariantCount: pkg.validationReport.passedInvariantCount,
            failedInvariantCount: pkg.validationReport.failedInvariantCount,
            validatedAt: pkg.validationReport.validatedAt
          })
        ]
      );
      await client.query("COMMIT");
      return {
        packageId: pkg.packageId,
        persistenceEvent: {
          eventId: persistEventId,
          packageId: pkg.packageId,
          eventType: "PERSISTENCE_COMMITTED",
          sequenceNumber: 1,
          publicationRequestFingerprint: null,
          eventPayload: {
            schemaVersion: pkg.schemaVersion,
            questionCount: pkg.canonicalQuestions.length
          },
          createdAt: Date.now()
        }
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  // ==========================================================================
  // 2. Real PostgreSQL Transactional Publication Gateway (SELECT FOR UPDATE)
  // ==========================================================================
  async publishPackage(request) {
    const { packageId, packageIntegritySeal, publicationAuthorityId, targetScope, publicationPolicyConfig } = request;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setSessionContext(client, null, true);
      const pkgLockRes = await client.query(
        "SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1 FOR UPDATE",
        [packageId]
      );
      if (pkgLockRes.rows.length === 0) {
        throw new PersistenceIntegrityError(packageId, "Package not found in persistent store.");
      }
      const eventsRes = await client.query(
        `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
         FROM public.canonical_package_events
         WHERE package_id = $1
         ORDER BY sequence_number ASC
         FOR UPDATE`,
        [packageId]
      );
      const events = eventsRes.rows.map((r) => ({
        eventId: r.event_id,
        packageId: r.package_id,
        eventType: r.event_type,
        sequenceNumber: r.sequence_number,
        publicationRequestFingerprint: r.publication_request_fingerprint,
        eventPayload: typeof r.event_payload === "string" ? JSON.parse(r.event_payload) : r.event_payload,
        createdAt: new Date(r.created_at).getTime()
      }));
      const currentState = reducePackageLifecycle(events, packageId);
      const incomingFingerprint = computePublicationRequestFingerprint(request);
      if (currentState === "PUBLISHED") {
        const pubEvents = events.filter((e) => e.eventType === "PUBLICATION_ISSUED");
        const latestPubEvent = pubEvents[pubEvents.length - 1];
        if (!latestPubEvent) {
          throw new PublicationConflictError(
            packageId,
            "State is PUBLISHED but no PUBLICATION_ISSUED event was found in ledger."
          );
        }
        if (latestPubEvent.publicationRequestFingerprint === incomingFingerprint) {
          await client.query("COMMIT");
          return this.reconstructReceiptFromEvent(latestPubEvent, packageIntegritySeal);
        } else {
          await client.query("ROLLBACK");
          throw new PublicationConflictError(
            packageId,
            `Publication request conflicts with active publication. Persistent fingerprint is ${latestPubEvent.publicationRequestFingerprint}, incoming is ${incomingFingerprint}.`
          );
        }
      }
      if (currentState !== "VALIDATED") {
        await client.query("ROLLBACK");
        throw new InvalidLifecycleTransitionError(
          currentState,
          "PUBLICATION_ISSUED",
          `Cannot publish package in state ${currentState}. Package must be in VALIDATED state before publication.`
        );
      }
      const priorPubCount = events.filter((e) => e.eventType === "PUBLICATION_ISSUED").length;
      const publicationSequenceNumber = priorPubCount + 1;
      const nextLedgerSeq = events.length + 1;
      const receiptId = computeCanonicalSha256("pub_receipt", {
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber
      });
      const hmacSignature = createHmac("sha256", this.serviceSigningSecret).update(receiptId).digest("hex");
      const publishedAt = (/* @__PURE__ */ new Date()).toISOString();
      const receiptPayload = {
        receiptId,
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber,
        publicationRequestFingerprint: incomingFingerprint,
        publishedAt,
        hmacSignature
      };
      const eventId = `evt_publication_issued_${packageId}_${nextLedgerSeq}`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          eventId,
          packageId,
          nextLedgerSeq,
          "PUBLICATION_ISSUED",
          incomingFingerprint,
          JSON.stringify({
            receiptId,
            publicationAuthorityId,
            publicationSequenceNumber,
            targetScope,
            publicationPolicyConfig: publicationPolicyConfig ?? {},
            publishedAt,
            hmacSignature
          })
        ]
      );
      await client.query("COMMIT");
      return receiptPayload;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  // ==========================================================================
  // 3. Real PostgreSQL Lifecycle Event Append (SELECT FOR UPDATE)
  // ==========================================================================
  async appendLifecycleEvent(packageId, eventType, eventPayload, publicationRequestFingerprint) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setSessionContext(client, null, true);
      const candidateEvent = await this.appendLifecycleEventWithClient(
        client,
        packageId,
        eventType,
        eventPayload,
        publicationRequestFingerprint
      );
      await client.query("COMMIT");
      return candidateEvent;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async appendLifecycleEventWithClient(client, packageId, eventType, eventPayload, publicationRequestFingerprint) {
    const lockRes = await client.query(
      "SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1 FOR UPDATE",
      [packageId]
    );
    if (lockRes.rows.length === 0) {
      throw new PersistenceIntegrityError(packageId, "Cannot append event to non-existent package envelope.");
    }
    if (eventType === "PUBLICATION_ISSUED" && (!publicationRequestFingerprint || publicationRequestFingerprint.trim() === "")) {
      throw new TableConstraintError(
        "chk_pub_fingerprint",
        'publication_request_fingerprint is strictly mandatory when event_type = "PUBLICATION_ISSUED".'
      );
    }
    const eventsRes = await client.query(
      `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
       FROM public.canonical_package_events
       WHERE package_id = $1
       ORDER BY sequence_number ASC
       FOR UPDATE`,
      [packageId]
    );
    const existingEvents = eventsRes.rows.map((r) => ({
      eventId: r.event_id,
      packageId: r.package_id,
      eventType: r.event_type,
      sequenceNumber: r.sequence_number,
      publicationRequestFingerprint: r.publication_request_fingerprint,
      eventPayload: typeof r.event_payload === "string" ? JSON.parse(r.event_payload) : r.event_payload,
      createdAt: new Date(r.created_at).getTime()
    }));
    const currentState = reducePackageLifecycle(existingEvents, packageId);
    const nextSeq = existingEvents.length + 1;
    let quarantineOrigin = null;
    if (currentState === "QUARANTINED") {
      const lastQuarantineTrigger = [...existingEvents].reverse().find((e) => e.eventType === "VALIDATION_RECORDED" || e.eventType === "QUARANTINE_APPLIED");
      if (lastQuarantineTrigger) {
        if (lastQuarantineTrigger.eventType === "VALIDATION_RECORDED") {
          quarantineOrigin = "PERSISTED";
        } else {
          quarantineOrigin = lastQuarantineTrigger.eventPayload.originState ?? "VALIDATED";
        }
      }
    }
    const candidateEvent = {
      eventId: `evt_${eventType.toLowerCase()}_${packageId}_${nextSeq}`,
      packageId,
      eventType,
      sequenceNumber: nextSeq,
      publicationRequestFingerprint: publicationRequestFingerprint ?? null,
      eventPayload,
      createdAt: Date.now()
    };
    applyLifecycleTransition(currentState, candidateEvent, quarantineOrigin);
    await client.query(
      `INSERT INTO public.canonical_package_events
        (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        candidateEvent.eventId,
        packageId,
        nextSeq,
        eventType,
        publicationRequestFingerprint ?? null,
        JSON.stringify(eventPayload)
      ]
    );
    return candidateEvent;
  }
  // ==========================================================================
  // 4. Package Reconstruction (Order-Preserving from PostgreSQL)
  // ==========================================================================
  async reconstructPackage(packageId, tenantId) {
    const client = await this.pool.connect();
    try {
      if (tenantId) {
        await this.setSessionContext(client, tenantId, false);
      } else {
        await this.setSessionContext(client, null, true);
      }
      const valEventRes = await client.query(
        `SELECT event_payload, created_at FROM public.canonical_package_events
         WHERE package_id = $1 AND event_type = 'VALIDATION_RECORDED'`,
        [packageId]
      );
      const valEvent = valEventRes.rows[0];
      const validationReport = valEvent ? typeof valEvent.event_payload === "string" ? JSON.parse(valEvent.event_payload) : valEvent.event_payload : {};
      const authenticValidationTimestamp = valEvent ? new Date(valEvent.created_at).getTime() : void 0;
      return await this.reconstructPackageInternalWithClient(client, packageId, validationReport, authenticValidationTimestamp);
    } finally {
      client.release();
    }
  }
  async reconstructPackageInternalWithClient(client, packageId, validationReport, authenticValidationTimestamp) {
    const pkgRes = await client.query(
      "SELECT package_id, source_snapshot_id, source_document_id, package_integrity_seal, schema_version, pipeline_algorithm_id, pipeline_algorithm_version, created_at FROM public.canonical_assessment_packages WHERE package_id = $1",
      [packageId]
    );
    if (pkgRes.rows.length === 0) {
      throw new PersistenceIntegrityError(packageId, "Package not found in persistent store.");
    }
    const pkgRow = pkgRes.rows[0];
    const qRes = await client.query(
      `SELECT canonical_question_id, question_index, logical_family_id, family_role, synthesized_question_type, canonical_fingerprint, source_discrepancies
       FROM public.canonical_questions
       WHERE package_id = $1
       ORDER BY question_index ASC`,
      [packageId]
    );
    const repRes = await client.query(
      `SELECT canonical_question_id, representation_index, representation_id, language_script, source_physical_instance_id, source_question_number, stem_ast, options, tables, diagrams, math_blocks
       FROM public.canonical_question_representations
       WHERE package_id = $1
       ORDER BY canonical_question_id, representation_index ASC`,
      [packageId]
    );
    const repsByQid = /* @__PURE__ */ new Map();
    for (const r of repRes.rows) {
      let list = repsByQid.get(r.canonical_question_id);
      if (!list) {
        list = [];
        repsByQid.set(r.canonical_question_id, list);
      }
      list.push({
        representationId: r.representation_id,
        languageScript: r.language_script,
        sourcePhysicalInstanceId: r.source_physical_instance_id,
        sourceQuestionNumber: r.source_question_number ?? void 0,
        stemAST: typeof r.stem_ast === "string" ? JSON.parse(r.stem_ast) : r.stem_ast,
        options: typeof r.options === "string" ? JSON.parse(r.options) : r.options,
        tables: r.tables !== null && r.tables !== void 0 ? typeof r.tables === "string" ? JSON.parse(r.tables) : r.tables : void 0,
        diagrams: r.diagrams !== null && r.diagrams !== void 0 ? typeof r.diagrams === "string" ? JSON.parse(r.diagrams) : r.diagrams : void 0,
        mathBlocks: r.math_blocks !== null && r.math_blocks !== void 0 ? typeof r.math_blocks === "string" ? JSON.parse(r.math_blocks) : r.math_blocks : void 0
      });
    }
    const canonicalQuestions = qRes.rows.map((qRow) => ({
      canonicalQuestionId: qRow.canonical_question_id,
      logicalFamilyId: qRow.logical_family_id,
      familyRole: qRow.family_role ?? void 0,
      synthesizedQuestionType: qRow.synthesized_question_type ?? void 0,
      canonicalFingerprint: qRow.canonical_fingerprint,
      representations: repsByQid.get(qRow.canonical_question_id) || [],
      sourceDiscrepancies: typeof qRow.source_discrepancies === "string" ? JSON.parse(qRow.source_discrepancies) : qRow.source_discrepancies
    }));
    const famRes = await client.query(
      `SELECT family_id, family_type, family_anchor_physical_instance_id, members
       FROM public.canonical_logical_families
       WHERE package_id = $1
       ORDER BY family_id ASC`,
      [packageId]
    );
    const logicalFamilies = famRes.rows.map((f) => ({
      familyId: f.family_id,
      familyType: f.family_type ?? void 0,
      familyAnchorPhysicalInstanceId: f.family_anchor_physical_instance_id ?? void 0,
      members: typeof f.members === "string" ? JSON.parse(f.members) : f.members
    }));
    const evalRes = await client.query(
      `SELECT evaluation_id, relationship_type, source_candidate_id, target_candidate_id, source_physical_instance_id, target_physical_instance_id, confidence_score, verification_status, evidence_payload
       FROM public.canonical_relationship_evaluations
       WHERE package_id = $1
       ORDER BY evaluation_id ASC`,
      [packageId]
    );
    const relationshipEvaluations = evalRes.rows.map((e) => ({
      evaluationId: e.evaluation_id,
      relationshipId: e.evaluation_id,
      relationshipType: e.relationship_type,
      sourceCandidateId: e.source_candidate_id,
      targetCandidateId: e.target_candidate_id,
      sourcePhysicalInstanceId: e.source_physical_instance_id,
      targetPhysicalInstanceId: e.target_physical_instance_id,
      allEvidence: typeof e.evidence_payload === "string" ? JSON.parse(e.evidence_payload) : e.evidence_payload,
      hardEvidence: [],
      supportingEvidence: [],
      weakEvidence: [],
      conflictingEvidence: [],
      confidenceScore: parseFloat(e.confidence_score),
      verificationStatus: e.verification_status,
      isSymmetric: true,
      isTransitive: false,
      isEligibleForFamilySynthesis: true,
      evaluationReasons: [],
      provenance: {
        sourceSnapshotId: pkgRow.source_snapshot_id,
        sourceDocumentId: pkgRow.source_document_id,
        algorithmId: pkgRow.pipeline_algorithm_id,
        algorithmVersion: pkgRow.pipeline_algorithm_version,
        evaluatedAt: 0
      }
    }));
    const memRes = await client.query(
      `SELECT membership_fingerprint, family_candidate_id, candidate_physical_instance_id, role, verification_status
       FROM public.canonical_family_memberships
       WHERE package_id = $1
       ORDER BY family_candidate_id ASC, candidate_physical_instance_id ASC`,
      [packageId]
    );
    const memberships = memRes.rows.map((m) => ({
      membershipFingerprint: m.membership_fingerprint,
      familyCandidateId: m.family_candidate_id,
      candidatePhysicalInstanceId: m.candidate_physical_instance_id,
      role: m.role ?? void 0,
      verificationStatus: m.verification_status,
      supportingEvidenceIds: []
    }));
    const qRelRes = await client.query(
      `SELECT relationship_id, source_candidate_id, target_candidate_id, relationship_type, quarantine_reason, quarantined_at
       FROM public.canonical_quarantined_relationships
       WHERE package_id = $1
       ORDER BY relationship_id ASC`,
      [packageId]
    );
    const quarantinedRelationships = qRelRes.rows.map((qr) => ({
      relationshipId: qr.relationship_id,
      sourceCandidateId: qr.source_candidate_id ?? "",
      targetCandidateId: qr.target_candidate_id ?? "",
      relationshipType: qr.relationship_type ?? "",
      quarantineReason: qr.quarantine_reason,
      quarantinedAt: qr.quarantined_at ? Number(qr.quarantined_at) : 0
    }));
    const ansRes = await client.query(
      `SELECT canonical_question_id, resolution_payload
       FROM public.canonical_answer_authority_resolutions
       WHERE package_id = $1`,
      [packageId]
    );
    const authoritativeAnswers = {};
    for (const a of ansRes.rows) {
      authoritativeAnswers[a.canonical_question_id] = typeof a.resolution_payload === "string" ? JSON.parse(a.resolution_payload) : a.resolution_payload;
    }
    return {
      packageId: pkgRow.package_id,
      sourceSnapshotId: pkgRow.source_snapshot_id,
      sourceDocumentId: pkgRow.source_document_id,
      packageIntegritySeal: pkgRow.package_integrity_seal,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships,
      quarantinedRelationships,
      authoritativeAnswers,
      validationReport: {
        ...validationReport,
        validationStatus: validationReport.validationStatus || "PACKAGE_VALIDATED",
        validatedAt: authenticValidationTimestamp || new Date(pkgRow.created_at).getTime()
      },
      schemaVersion: pkgRow.schema_version,
      pipelineAlgorithmId: pkgRow.pipeline_algorithm_id,
      pipelineAlgorithmVersion: pkgRow.pipeline_algorithm_version,
      sealedFingerprint: pkgRow.package_integrity_seal,
      sealedAt: authenticValidationTimestamp || new Date(pkgRow.created_at).getTime()
    };
  }
  // ==========================================================================
  // 5. Supersession & Lifecycle Queries
  // ==========================================================================
  async registerSupersession(predecessorPackageId, successorPackageId, reason, authorityDocSourceId) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setSessionContext(client, null, true);
      const pCheck = await client.query("SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1", [predecessorPackageId]);
      const sCheck = await client.query("SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1", [successorPackageId]);
      if (pCheck.rows.length === 0 || sCheck.rows.length === 0) {
        throw new PersistenceIntegrityError(predecessorPackageId, "Both predecessor and successor must exist in persistent store.");
      }
      if (predecessorPackageId === successorPackageId) {
        throw new TableConstraintError("chk_no_self_supersession", "A package cannot supersede itself.");
      }
      const cycleCheck = await client.query(
        "SELECT 1 FROM public.canonical_package_supersessions WHERE predecessor_package_id = $1 AND successor_package_id = $2",
        [successorPackageId, predecessorPackageId]
      );
      if (cycleCheck.rows.length > 0) {
        throw new TableConstraintError("chk_dag_cycle", "Cyclic package supersession detected.");
      }
      const supersessionId = `sup_${predecessorPackageId}_${successorPackageId}`;
      await client.query(
        `INSERT INTO public.canonical_package_supersessions
          (supersession_id, predecessor_package_id, successor_package_id, supersession_reason, authority_document_source_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [supersessionId, predecessorPackageId, successorPackageId, reason, authorityDocSourceId ?? null]
      );
      await this.appendLifecycleEventWithClient(client, predecessorPackageId, "SUPERSESSION_REGISTERED", {
        successorPackageId,
        supersessionReason: reason
      });
      await client.query("COMMIT");
      return {
        supersessionId,
        predecessorPackageId,
        successorPackageId,
        supersessionReason: reason,
        authorityDocumentSourceId: authorityDocSourceId ?? null,
        createdAt: Date.now()
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async getPackageLifecycleState(packageId) {
    const events = await this.getEventsForPackage(packageId);
    return reducePackageLifecycle(events, packageId);
  }
  async getEventsForPackage(packageId) {
    const client = await this.pool.connect();
    try {
      await this.setSessionContext(client, null, true);
      const res = await client.query(
        `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
         FROM public.canonical_package_events
         WHERE package_id = $1
         ORDER BY sequence_number ASC`,
        [packageId]
      );
      return res.rows.map((r) => ({
        eventId: r.event_id,
        packageId: r.package_id,
        eventType: r.event_type,
        sequenceNumber: r.sequence_number,
        publicationRequestFingerprint: r.publication_request_fingerprint,
        eventPayload: typeof r.event_payload === "string" ? JSON.parse(r.event_payload) : r.event_payload,
        createdAt: new Date(r.created_at).getTime()
      }));
    } finally {
      client.release();
    }
  }
  // ==========================================================================
  // 6. RLS & Tenancy Helpers
  // ==========================================================================
  async setSessionContext(client, tenantId, isServiceRole = false) {
    if (isServiceRole) {
      try {
        await client.query("RESET ROLE");
      } catch {
      }
      await client.query("SELECT set_config('app.is_service_role', 'true', false)");
      await client.query("SELECT set_config('app.current_tenant_id', '', false)");
    } else {
      try {
        await client.query("SET ROLE uadue_app_user");
      } catch {
      }
      await client.query("SELECT set_config('app.is_service_role', 'false', false)");
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId || ""]);
    }
  }
  verifyReceiptSignature(receipt) {
    const expectedSig = createHmac("sha256", this.serviceSigningSecret).update(receipt.receiptId).digest("hex");
    return receipt.hmacSignature === expectedSig;
  }
  reconstructReceiptFromEvent(event, packageIntegritySeal) {
    const p = event.eventPayload;
    return {
      receiptId: p.receiptId,
      packageId: event.packageId,
      packageIntegritySeal,
      publicationAuthorityId: p.publicationAuthorityId,
      publicationSequenceNumber: p.publicationSequenceNumber,
      publicationRequestFingerprint: event.publicationRequestFingerprint,
      publishedAt: p.publishedAt,
      hmacSignature: p.hmacSignature
    };
  }
  // ==========================================================================
  // 7. Deliberate Tampering Hooks for Real Adversarial Database Testing
  // ==========================================================================
  async tamperWithRepresentationASTInDb(representationId, mutatedText) {
    const client = await this.pool.connect();
    try {
      await this.setSessionContext(client, null, true);
      const mutatedAst = JSON.stringify([
        {
          nodeId: "ast_text_tampered",
          nodeType: "TEXT",
          rawContent: mutatedText,
          normalizedContent: mutatedText,
          isSemanticInterpretationResolved: true,
          provenance: []
        }
      ]);
      await client.query(
        "UPDATE public.canonical_question_representations SET stem_ast = $1 WHERE representation_id = $2",
        [mutatedAst, representationId]
      );
    } finally {
      client.release();
    }
  }
  async attemptUpdatePackageHeader(packageId) {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE public.canonical_assessment_packages SET schema_version = 'tampered' WHERE package_id = $1", [packageId]);
    } catch (err) {
      if (err.message?.includes("UADUE Immutability Violation")) {
        throw new ImmutabilityViolationError("canonical_assessment_packages", "UPDATE");
      }
      throw err;
    } finally {
      client.release();
    }
  }
  async attemptDeletePackageHeader(packageId) {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM public.canonical_assessment_packages WHERE package_id = $1", [packageId]);
    } catch (err) {
      if (err.message?.includes("UADUE Immutability Violation")) {
        throw new ImmutabilityViolationError("canonical_assessment_packages", "DELETE");
      }
      throw err;
    } finally {
      client.release();
    }
  }
  async attemptMutateEventRow(eventId) {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE public.canonical_package_events SET event_type = 'tampered' WHERE event_id = $1", [eventId]);
    } catch (err) {
      if (err.message?.includes("UADUE Immutability Violation")) {
        throw new ImmutabilityViolationError("canonical_package_events", "UPDATE");
      }
      throw err;
    } finally {
      client.release();
    }
  }
  async getPackageWithTenancyCheck(packageId, tenantId) {
    const client = await this.pool.connect();
    try {
      await this.setSessionContext(client, tenantId, false);
      const res = await client.query("SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1", [packageId]);
      if (res.rows.length === 0) {
        throw new TenancyAccessError(`Package ${packageId} is not accessible to tenant ${tenantId}.`);
      }
      return res.rows[0];
    } finally {
      try {
        await client.query("RESET ROLE");
      } catch {
      }
      client.release();
    }
  }
  async tamperShuffleChildRows(packageId) {
  }
};

// src/services/uadue/contracts/identity.ts
function computeDeterministicHash(input) {
  let h1 = 3735928559;
  let h2 = 1103515245;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}`;
}

// src/services/uadue/canonical/relationshipEvaluationEngine.ts
var HARD_EVIDENCE_TYPES = /* @__PURE__ */ new Set([
  "FACING_PAGE_SPREAD_PAIR",
  "MATCHING_PRINTED_NUMERAL",
  "DISTINCT_SCRIPT_DETECTION",
  "IDENTICAL_OPTION_CARDINALITY",
  "MATCHING_SUB_CLAUSE_TOPOLOGY",
  "EXPLICIT_OFFICIAL_QUESTION_ID"
]);
var SUPPORTING_EVIDENCE_TYPES = /* @__PURE__ */ new Set([
  "IDENTICAL_SECTION_CONTEXT",
  "HOMOLOGOUS_SPATIAL_ORDER",
  "SHARED_VISUAL_ASSET_REFERENCE",
  "PARALLEL_COLUMN_LAYOUT"
]);
var WEAK_EVIDENCE_TYPES = /* @__PURE__ */ new Set([
  "SAME_PRINTED_NUMBER_ONLY",
  "ROUGH_TEXT_LENGTH_PROPORTION",
  "COMMON_PUNCTUATION_PATTERN"
]);
var CONFLICTING_EVIDENCE_TYPES = /* @__PURE__ */ new Set([
  "NUMERICAL_DISCONTINUITY",
  "INCOMPATIBLE_OPTION_CARDINALITY",
  "DIFFERENT_SECTION_CONTEXT",
  "SAME_SCRIPT_ON_FACING_SPREAD",
  "INCOMPATIBLE_SPATIAL_ORDER"
]);
var DEFAULT_ALGORITHM_ID = "uadue_rel_eval_engine_v3";
var DEFAULT_ALGORITHM_VERSION = "3.0.0";
var RelationshipEvaluationEngine = class {
  algorithmId;
  algorithmVersion;
  constructor(algorithmId = DEFAULT_ALGORITHM_ID, algorithmVersion = DEFAULT_ALGORITHM_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }
  /**
   * Evaluates a single pairwise relationship candidate against per-relationship evidence rules.
   * Pure function: does NOT mutate sourceCandidate, targetCandidate, or relationship.
   */
  evaluateRelationship(input) {
    const { relationship, sourceCandidate, targetCandidate } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;
    const relationshipType = relationship.relationshipType;
    const allEvidence = [...relationship.evidence || []];
    const hardEvidence = [];
    const supportingEvidence = [];
    const weakEvidence = [];
    const conflictingEvidence = [];
    for (const ev of allEvidence) {
      if (CONFLICTING_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === "CONFLICTING") {
        conflictingEvidence.push(ev);
      } else if (HARD_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === "HARD") {
        hardEvidence.push(ev);
      } else if (SUPPORTING_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === "SUPPORTING") {
        supportingEvidence.push(ev);
      } else if (WEAK_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === "WEAK") {
        weakEvidence.push(ev);
      }
    }
    this.enrichPerRelationshipEvidence(
      relationshipType,
      sourceCandidate,
      targetCandidate,
      hardEvidence,
      supportingEvidence,
      conflictingEvidence
    );
    const { verificationStatus, isEligibleForFamilySynthesis, evaluationReasons, unresolvedReasons } = this.evaluateVerificationStatus(
      relationshipType,
      hardEvidence,
      supportingEvidence,
      weakEvidence,
      conflictingEvidence
    );
    const { isSymmetric, isTransitive, transitivityConditions } = this.getAlgebraicProperties(relationshipType);
    const confidenceScore = this.computeDescriptiveConfidence(
      hardEvidence,
      supportingEvidence,
      weakEvidence,
      conflictingEvidence
    );
    const provenance = {
      sourceSnapshotId: relationship.provenance?.sourceSnapshotId || "snapshot_unknown",
      sourceDocumentId: relationship.provenance?.sourceDocumentId || "doc_unknown",
      algorithmId,
      algorithmVersion,
      evaluatedAt: 0
      // Deterministic epoch for repeatable hashing
    };
    const sortedHardIds = hardEvidence.map((e) => e.evidenceId).sort().join(",");
    const sortedConfIds = conflictingEvidence.map((e) => e.evidenceId).sort().join(",");
    const evaluationId = computeDeterministicHash(
      `eval:${relationship.relationshipId}:${sourceCandidate.physicalInstanceId}:${targetCandidate.physicalInstanceId}:${verificationStatus}:${sortedHardIds}:${sortedConfIds}`
    );
    return {
      evaluationId,
      relationshipId: relationship.relationshipId,
      relationshipType,
      sourceCandidateId: sourceCandidate.candidateId,
      targetCandidateId: targetCandidate.candidateId,
      sourcePhysicalInstanceId: sourceCandidate.physicalInstanceId,
      targetPhysicalInstanceId: targetCandidate.physicalInstanceId,
      allEvidence: [...hardEvidence, ...supportingEvidence, ...weakEvidence, ...conflictingEvidence],
      hardEvidence,
      supportingEvidence,
      weakEvidence,
      conflictingEvidence,
      confidenceScore,
      verificationStatus,
      isSymmetric,
      isTransitive,
      transitivityConditions,
      isEligibleForFamilySynthesis,
      evaluationReasons,
      unresolvedReasons: unresolvedReasons.length > 0 ? unresolvedReasons : void 0,
      provenance
    };
  }
  /**
   * Batch evaluation across all candidates and relationships in a QuestionGraph.
   */
  evaluateAllRelationships(input) {
    const candidateMap = /* @__PURE__ */ new Map();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));
    const results = [];
    const sortedRelationships = [...input.relationships].sort(
      (a, b) => a.relationshipId.localeCompare(b.relationshipId)
    );
    for (const rel of sortedRelationships) {
      const sourceCandidate = candidateMap.get(rel.sourceCandidateId);
      const targetCandidate = candidateMap.get(rel.targetCandidateId);
      if (!sourceCandidate || !targetCandidate) {
        continue;
      }
      results.push(
        this.evaluateRelationship({
          relationship: rel,
          sourceCandidate,
          targetCandidate,
          documentGraph: input.documentGraph,
          sourceReferences: input.sourceReferences,
          algorithmId: input.algorithmId,
          algorithmVersion: input.algorithmVersion
        })
      );
    }
    return results;
  }
  // ==========================================================================
  // Private Helpers
  // ==========================================================================
  enrichPerRelationshipEvidence(relationshipType, sourceCandidate, targetCandidate, hardEvidence, supportingEvidence, conflictingEvidence) {
    const sourceScript = sourceCandidate.languageRepresentations?.[0]?.languageScript || "LATIN";
    const targetScript = targetCandidate.languageRepresentations?.[0]?.languageScript || "LATIN";
    if (relationshipType === "LANGUAGE_REPRESENTATION_OF") {
      const isFacingPages = sourceCandidate.startPageNumber % 2 === 0 && targetCandidate.startPageNumber === sourceCandidate.startPageNumber + 1;
      if (isFacingPages && sourceScript === targetScript && sourceScript === "LATIN") {
        const alreadyHas = conflictingEvidence.some((e) => e.evidenceType === "SAME_SCRIPT_ON_FACING_SPREAD");
        if (!alreadyHas) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "SAME_SCRIPT_ON_FACING_SPREAD",
            evidenceStrength: "CONFLICTING",
            sourceNodeIds: [],
            description: "Both candidates are Latin script on facing pages (sequential questions, not translations).",
            confidence: 1
          });
        }
      }
      if (isFacingPages && sourceScript !== targetScript) {
        const alreadyHasScript = hardEvidence.some((e) => e.evidenceType === "DISTINCT_SCRIPT_DETECTION");
        if (!alreadyHasScript) {
          hardEvidence.push({
            evidenceId: `ev_hard_script_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "DISTINCT_SCRIPT_DETECTION",
            evidenceStrength: "HARD",
            sourceNodeIds: [],
            description: `Distinct script pair detected: ${sourceScript} vs ${targetScript}.`,
            confidence: 1
          });
        }
        const alreadyHasSpread = hardEvidence.some((e) => e.evidenceType === "FACING_PAGE_SPREAD_PAIR");
        if (!alreadyHasSpread) {
          hardEvidence.push({
            evidenceId: `ev_hard_spread_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "FACING_PAGE_SPREAD_PAIR",
            evidenceStrength: "HARD",
            sourceNodeIds: [],
            description: `Facing page spread verified: Page ${sourceCandidate.startPageNumber} (Verso) and Page ${targetCandidate.startPageNumber} (Recto).`,
            confidence: 1
          });
        }
      }
      const sourceOptCount = sourceCandidate.optionCandidateIds?.length || 0;
      const targetOptCount = targetCandidate.optionCandidateIds?.length || 0;
      if (sourceOptCount > 0 && sourceOptCount === targetOptCount) {
        const alreadyHasOpt = hardEvidence.some((e) => e.evidenceType === "IDENTICAL_OPTION_CARDINALITY");
        if (!alreadyHasOpt) {
          hardEvidence.push({
            evidenceId: `ev_hard_opts_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "IDENTICAL_OPTION_CARDINALITY",
            evidenceStrength: "HARD",
            sourceNodeIds: [],
            description: `Option cardinality identical: ${sourceOptCount} options in both representations.`,
            confidence: 1
          });
        }
      } else if (sourceOptCount > 0 && targetOptCount > 0 && sourceOptCount !== targetOptCount) {
        const alreadyHasIncomp = conflictingEvidence.some((e) => e.evidenceType === "INCOMPATIBLE_OPTION_CARDINALITY");
        if (!alreadyHasIncomp) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_opts_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "INCOMPATIBLE_OPTION_CARDINALITY",
            evidenceStrength: "CONFLICTING",
            sourceNodeIds: [],
            description: `Incompatible option counts: ${sourceOptCount} vs ${targetOptCount}.`,
            confidence: 1
          });
        }
      }
    }
    if (relationshipType === "CONTINUATION_OF") {
      const isMonotonic = sourceCandidate.startPageNumber < targetCandidate.startPageNumber || sourceCandidate.startPageNumber === targetCandidate.startPageNumber && sourceCandidate.candidateDisplayOrder < targetCandidate.candidateDisplayOrder;
      if (!isMonotonic) {
        const alreadyHasOrder = conflictingEvidence.some((e) => e.evidenceType === "INCOMPATIBLE_SPATIAL_ORDER");
        if (!alreadyHasOrder) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_order_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: "INCOMPATIBLE_SPATIAL_ORDER",
            evidenceStrength: "CONFLICTING",
            sourceNodeIds: [],
            description: `Non-monotonic continuation order: Page ${sourceCandidate.startPageNumber} (Order ${sourceCandidate.candidateDisplayOrder}) to Page ${targetCandidate.startPageNumber} (Order ${targetCandidate.candidateDisplayOrder}).`,
            confidence: 1
          });
        }
      }
    }
  }
  evaluateVerificationStatus(relationshipType, hardEvidence, supportingEvidence, weakEvidence, conflictingEvidence) {
    const evaluationReasons = [];
    const unresolvedReasons = [];
    if (conflictingEvidence.length > 0) {
      evaluationReasons.push(
        `Conflicting evidence detected (${conflictingEvidence.length} tokens): ${conflictingEvidence.map((e) => e.evidenceType).join(", ")}`
      );
      return {
        verificationStatus: "RELATIONSHIP_CONFLICTED",
        isEligibleForFamilySynthesis: false,
        evaluationReasons,
        unresolvedReasons
      };
    }
    switch (relationshipType) {
      case "LANGUAGE_REPRESENTATION_OF":
      case "SAME_LOGICAL_QUESTION": {
        if (hardEvidence.length >= 2) {
          evaluationReasons.push(
            `Formally proven with ${hardEvidence.length} hard evidence tokens: ${hardEvidence.map((e) => e.evidenceType).join(", ")}`
          );
          return {
            verificationStatus: "RELATIONSHIP_PROVEN",
            isEligibleForFamilySynthesis: true,
            evaluationReasons,
            unresolvedReasons
          };
        }
        if (hardEvidence.length === 1 && supportingEvidence.length >= 1) {
          unresolvedReasons.push("Single hard evidence token with supporting context; requires human verification.");
          evaluationReasons.push("Plausible candidate under review.");
          return {
            verificationStatus: "RELATIONSHIP_PLAUSIBLE",
            isEligibleForFamilySynthesis: false,
            evaluationReasons,
            unresolvedReasons
          };
        }
        unresolvedReasons.push("Insufficient evidence tokens (< 2 Hard, < 1 Supporting).");
        evaluationReasons.push("Ambiguous relationship candidate.");
        return {
          verificationStatus: "RELATIONSHIP_AMBIGUOUS",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "CONTINUATION_OF": {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push("Monotonic continuation verified without spatial conflicts.");
          return {
            verificationStatus: "RELATIONSHIP_PROVEN",
            isEligibleForFamilySynthesis: false,
            // CONTINUATION merges candidate node sets, does not create multi-candidate family
            evaluationReasons,
            unresolvedReasons
          };
        }
        unresolvedReasons.push("Unverified continuation edge.");
        return {
          verificationStatus: "RELATIONSHIP_UNVERIFIED",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "SHARED_STIMULUS_CHILD_OF": {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push("Hierarchical stimulus child link verified.");
          return {
            verificationStatus: "RELATIONSHIP_PROVEN",
            isEligibleForFamilySynthesis: false,
            // Stimulus parent-child link does not merge child into parent's family
            evaluationReasons,
            unresolvedReasons
          };
        }
        unresolvedReasons.push("Unverified stimulus child link.");
        return {
          verificationStatus: "RELATIONSHIP_UNVERIFIED",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "VARIANT_OF": {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push("Pedagogical variant relation verified.");
          return {
            verificationStatus: "RELATIONSHIP_PROVEN",
            isEligibleForFamilySynthesis: false,
            // Variants form distinct families
            evaluationReasons,
            unresolvedReasons
          };
        }
        unresolvedReasons.push("Unverified variant edge.");
        return {
          verificationStatus: "RELATIONSHIP_UNVERIFIED",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "POSSIBLE_DUPLICATE_CANDIDATE": {
        unresolvedReasons.push("Suspected duplicate physical scan or OCR artifact; requires manual staff disambiguation.");
        evaluationReasons.push("Flagged for manual review.");
        return {
          verificationStatus: "RELATIONSHIP_PLAUSIBLE",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "REVISED_KEY_FOR": {
        evaluationReasons.push("Official answer key revision overlay verified.");
        return {
          verificationStatus: "RELATIONSHIP_PROVEN",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "RELATED_BUT_DISTINCT": {
        evaluationReasons.push("Distinct question isolation verified.");
        return {
          verificationStatus: "RELATIONSHIP_PROVEN",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
      case "UNKNOWN_RELATIONSHIP":
      default: {
        unresolvedReasons.push("Unknown or unverified relationship.");
        evaluationReasons.push("Unverified relation.");
        return {
          verificationStatus: "RELATIONSHIP_UNVERIFIED",
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons
        };
      }
    }
  }
  getAlgebraicProperties(relationshipType) {
    switch (relationshipType) {
      case "LANGUAGE_REPRESENTATION_OF":
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions: "STRICTLY_NON_TRANSITIVE: Direct pairwise proof required for each language pair. A <-> B and B <-> C does NOT imply A <-> C."
        };
      case "SAME_LOGICAL_QUESTION":
        return {
          isSymmetric: true,
          isTransitive: true,
          transitivityConditions: "TRANSITIVE_UNDER_STRICT_ID_EQUIVALENCE: Valid if and only if official authority ID or certified cross-variant mapping matches identically."
        };
      case "VARIANT_OF":
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Parameter variants form distinct canonical question families."
        };
      case "CONTINUATION_OF":
        return {
          isSymmetric: false,
          isTransitive: true,
          transitivityConditions: "TRANSITIVE_UNDER_MONOTONIC_SEQUENCE: Valid if and only if reading order and page sequence are strictly monotonic without cycles."
        };
      case "SHARED_STIMULUS_CHILD_OF":
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Children sharing a common stimulus remain distinct question families."
        };
      case "POSSIBLE_DUPLICATE_CANDIDATE":
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Suspected duplicates require manual disambiguation."
        };
      case "REVISED_KEY_FOR":
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Targeted overlay on specific canonical question."
        };
      case "RELATED_BUT_DISTINCT":
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Proximity or theme overlap does not propagate."
        };
      case "UNKNOWN_RELATIONSHIP":
      default:
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions: "NON_TRANSITIVE: Unverified relation."
        };
    }
  }
  computeDescriptiveConfidence(hardEvidence, supportingEvidence, weakEvidence, conflictingEvidence) {
    if (conflictingEvidence.length > 0) {
      return 0;
    }
    const hardWeight = hardEvidence.length * 0.45;
    const suppWeight = supportingEvidence.length * 0.15;
    const weakWeight = weakEvidence.length * 0.05;
    const raw = hardWeight + suppWeight + weakWeight;
    return Math.min(1, Math.max(0, Number(raw.toFixed(4))));
  }
};

// src/services/uadue/canonical/candidateFamilyMembershipEvaluator.ts
var DEFAULT_MEMBERSHIP_ALGORITHM_ID = "uadue_family_membership_evaluator_v3";
var DEFAULT_MEMBERSHIP_ALGORITHM_VERSION = "3.0.0";
var ALLOWED_MEMBERSHIP_RELATIONSHIP_TYPES = /* @__PURE__ */ new Set([
  "SAME_LOGICAL_QUESTION",
  "LANGUAGE_REPRESENTATION_OF"
]);
var CandidateFamilyMembershipEvaluator = class {
  algorithmId;
  algorithmVersion;
  constructor(algorithmId = DEFAULT_MEMBERSHIP_ALGORITHM_ID, algorithmVersion = DEFAULT_MEMBERSHIP_ALGORITHM_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }
  /**
   * Evaluates a single pairwise candidate family membership proposal.
   * Pure function: does NOT mutate candidate, familyTargetCandidate, or relationship evaluation.
   */
  evaluateMembership(input) {
    const { candidate, familyTargetCandidate, directRelationshipEvaluation } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;
    const rejectionReasons = [];
    const evaluationReasons = [];
    if (!candidate || !candidate.physicalInstanceId) {
      rejectionReasons.push("Candidate physical instance ID is missing or invalid.");
    }
    if (!familyTargetCandidate || !familyTargetCandidate.candidateId) {
      rejectionReasons.push("Family target candidate is missing or invalid.");
    }
    if (!directRelationshipEvaluation) {
      rejectionReasons.push("Direct relationship evaluation reference is missing (dangling reference).");
      const hash = computeDeterministicHash(
        `membership_rejected:${candidate?.physicalInstanceId || "unknown"}:${familyTargetCandidate?.candidateId || "unknown"}:missing_eval`
      );
      return {
        isAccepted: false,
        rejectionReasons,
        evaluationReasons,
        deterministicFingerprint: hash
      };
    }
    if (!ALLOWED_MEMBERSHIP_RELATIONSHIP_TYPES.has(directRelationshipEvaluation.relationshipType)) {
      rejectionReasons.push(
        `Relationship type '${directRelationshipEvaluation.relationshipType}' is not eligible for family membership. Permitted types are: SAME_LOGICAL_QUESTION, LANGUAGE_REPRESENTATION_OF.`
      );
    }
    if (directRelationshipEvaluation.verificationStatus !== "RELATIONSHIP_PROVEN") {
      rejectionReasons.push(
        `Direct relationship verification status '${directRelationshipEvaluation.verificationStatus}' is not RELATIONSHIP_PROVEN.`
      );
    }
    if (!directRelationshipEvaluation.isEligibleForFamilySynthesis) {
      rejectionReasons.push(
        "Direct relationship evaluation has isEligibleForFamilySynthesis = false."
      );
    }
    if (directRelationshipEvaluation.conflictingEvidence && directRelationshipEvaluation.conflictingEvidence.length > 0) {
      rejectionReasons.push(
        `Direct relationship contains ${directRelationshipEvaluation.conflictingEvidence.length} conflicting evidence tokens.`
      );
    }
    if (candidate && familyTargetCandidate) {
      const evalSourcePhys = directRelationshipEvaluation.sourcePhysicalInstanceId;
      const evalTargetPhys = directRelationshipEvaluation.targetPhysicalInstanceId;
      const candPhys = candidate.physicalInstanceId;
      const targetPhys = familyTargetCandidate.physicalInstanceId;
      const isDirectPair = evalSourcePhys === candPhys && evalTargetPhys === targetPhys || evalTargetPhys === candPhys && evalSourcePhys === targetPhys;
      if (!isDirectPair) {
        rejectionReasons.push(
          `Evaluation ID '${directRelationshipEvaluation.evaluationId}' candidate pair (${evalSourcePhys}, ${evalTargetPhys}) does not match membership candidates (${candPhys}, ${targetPhys}).`
        );
      }
    }
    if (!directRelationshipEvaluation.evaluationId || directRelationshipEvaluation.evaluationId.trim().length === 0) {
      rejectionReasons.push("Direct relationship evaluation contains an empty or invalid evaluation ID.");
    }
    if (input.sourceSnapshotId && directRelationshipEvaluation.provenance) {
      if (directRelationshipEvaluation.provenance.sourceSnapshotId !== input.sourceSnapshotId) {
        rejectionReasons.push(
          `Provenance mismatch: input sourceSnapshotId '${input.sourceSnapshotId}' does not match evaluation '${directRelationshipEvaluation.provenance.sourceSnapshotId}'.`
        );
      }
    }
    if (input.sourceDocumentId && directRelationshipEvaluation.provenance) {
      if (directRelationshipEvaluation.provenance.sourceDocumentId !== input.sourceDocumentId) {
        rejectionReasons.push(
          `Provenance mismatch: input sourceDocumentId '${input.sourceDocumentId}' does not match evaluation '${directRelationshipEvaluation.provenance.sourceDocumentId}'.`
        );
      }
    }
    if (rejectionReasons.length > 0) {
      const sortedRejections = [...rejectionReasons].sort().join(";");
      const rejectionFingerprint = computeDeterministicHash(
        `membership_rejected:${candidate?.physicalInstanceId || "unknown"}:${familyTargetCandidate?.candidateId || "unknown"}:${directRelationshipEvaluation.evaluationId}:${sortedRejections}`
      );
      return {
        isAccepted: false,
        rejectionReasons,
        evaluationReasons: [],
        deterministicFingerprint: rejectionFingerprint
      };
    }
    const directEvidenceReferences = [
      ...directRelationshipEvaluation.allEvidence || []
    ];
    const provenance = {
      sourceSnapshotId: directRelationshipEvaluation.provenance?.sourceSnapshotId || "snapshot_unknown",
      sourceDocumentId: directRelationshipEvaluation.provenance?.sourceDocumentId || "doc_unknown",
      algorithmId,
      algorithmVersion,
      evaluatedAt: 0
      // Deterministic epoch for stable hashing
    };
    const sortedEvidenceIds = directEvidenceReferences.map((e) => e.evidenceId).sort().join(",");
    const membershipFingerprint = computeDeterministicHash(
      `membership_accepted:${candidate.physicalInstanceId}:${familyTargetCandidate.candidateId}:${directRelationshipEvaluation.evaluationId}:${sortedEvidenceIds}`
    );
    evaluationReasons.push(
      `Directly proven ${directRelationshipEvaluation.relationshipType} relationship verified against family target ${familyTargetCandidate.candidateId}.`
    );
    evaluationReasons.push(`Direct evaluation ID: ${directRelationshipEvaluation.evaluationId}`);
    evaluationReasons.push(`Supporting evidence count: ${directEvidenceReferences.length}`);
    const membership = {
      candidatePhysicalInstanceId: candidate.physicalInstanceId,
      familyCandidateId: familyTargetCandidate.candidateId,
      directRelationshipEvaluationIds: [directRelationshipEvaluation.evaluationId],
      directEvidenceReferences,
      verificationStatus: "RELATIONSHIP_PROVEN",
      provenance,
      algorithmVersion,
      membershipFingerprint,
      isAccepted: true,
      membershipReasons: evaluationReasons
    };
    return {
      membership,
      isAccepted: true,
      rejectionReasons: [],
      evaluationReasons,
      deterministicFingerprint: membershipFingerprint
    };
  }
  /**
   * Batch evaluation across multiple explicit candidate family membership proposals.
   * Pure function: operates strictly on supplied proposals without graph closures or transitive clustering.
   */
  evaluateBatchMemberships(input) {
    const candidateMap = /* @__PURE__ */ new Map();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));
    const evalMap = /* @__PURE__ */ new Map();
    input.relationshipEvaluations.forEach((e) => evalMap.set(e.evaluationId, e));
    const results = [];
    const sortedProposals = [...input.membershipProposals].sort((a, b) => {
      const cmpCand = a.candidateId.localeCompare(b.candidateId);
      if (cmpCand !== 0) return cmpCand;
      return a.familyTargetCandidateId.localeCompare(b.familyTargetCandidateId);
    });
    for (const proposal of sortedProposals) {
      const candidate = candidateMap.get(proposal.candidateId);
      const familyTargetCandidate = candidateMap.get(proposal.familyTargetCandidateId);
      const directRelationshipEvaluation = evalMap.get(proposal.relationshipEvaluationId);
      if (!candidate || !familyTargetCandidate || !directRelationshipEvaluation) {
        const rejectionReasons = [];
        if (!candidate) rejectionReasons.push(`Candidate '${proposal.candidateId}' not found.`);
        if (!familyTargetCandidate)
          rejectionReasons.push(`Family target candidate '${proposal.familyTargetCandidateId}' not found.`);
        if (!directRelationshipEvaluation)
          rejectionReasons.push(`Relationship evaluation '${proposal.relationshipEvaluationId}' not found (dangling ID).`);
        const hash = computeDeterministicHash(
          `membership_rejected:${proposal.candidateId}:${proposal.familyTargetCandidateId}:${proposal.relationshipEvaluationId}:missing_ref`
        );
        results.push({
          isAccepted: false,
          rejectionReasons,
          evaluationReasons: [],
          deterministicFingerprint: hash
        });
        continue;
      }
      results.push(
        this.evaluateMembership({
          candidate,
          familyTargetCandidate,
          directRelationshipEvaluation,
          sourceSnapshotId: input.sourceSnapshotId,
          sourceDocumentId: input.sourceDocumentId,
          algorithmId: input.algorithmId,
          algorithmVersion: input.algorithmVersion
        })
      );
    }
    return results;
  }
};

// src/services/uadue/canonical/logicalFamilySynthesizer.ts
var DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_ID = "uadue_family_synthesizer_v3";
var DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_VERSION = "3.0.0";
var LogicalFamilySynthesizer = class {
  algorithmId;
  algorithmVersion;
  constructor(algorithmId = DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_ID, algorithmVersion = DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }
  /**
   * Synthesizes a single LogicalQuestionFamily anchored by a designated anchor candidate.
   * Pure function: does NOT mutate candidates or memberships.
   */
  synthesizeFamily(input) {
    const { anchorCandidate, acceptedMemberships, allCandidates } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;
    const rejectionReasons = [];
    const synthesisReasons = [];
    if (!anchorCandidate || !anchorCandidate.physicalInstanceId) {
      rejectionReasons.push("Anchor candidate is missing or invalid.");
      const hash = computeDeterministicHash("family_rejected:missing_anchor");
      return {
        isSynthesized: false,
        rejectionReasons,
        synthesisReasons,
        deterministicFingerprint: hash
      };
    }
    const candIdMap = /* @__PURE__ */ new Map();
    const candPhysMap = /* @__PURE__ */ new Map();
    for (const c of allCandidates || []) {
      candIdMap.set(c.candidateId, c);
      candPhysMap.set(c.physicalInstanceId, c);
    }
    candIdMap.set(anchorCandidate.candidateId, anchorCandidate);
    candPhysMap.set(anchorCandidate.physicalInstanceId, anchorCandidate);
    const relevantMemberships = (acceptedMemberships || []).filter(
      (m) => m.isAccepted && m.familyCandidateId === anchorCandidate.candidateId
    );
    for (const m of relevantMemberships) {
      const referencedCandidate = candPhysMap.get(m.candidatePhysicalInstanceId);
      if (!referencedCandidate) {
        rejectionReasons.push(
          `Membership references non-existent physical candidate '${m.candidatePhysicalInstanceId}'.`
        );
      }
    }
    if (rejectionReasons.length > 0) {
      const sortedRejections = [...rejectionReasons].sort().join(";");
      const hash = computeDeterministicHash(
        `family_rejected:${anchorCandidate.physicalInstanceId}:${sortedRejections}`
      );
      return {
        isSynthesized: false,
        rejectionReasons,
        synthesisReasons: [],
        deterministicFingerprint: hash
      };
    }
    const anchorScript = anchorCandidate.languageRepresentations?.[0]?.languageScript || "LATIN";
    const anchorMember = {
      candidatePhysicalInstanceId: anchorCandidate.physicalInstanceId,
      candidateId: anchorCandidate.candidateId,
      representationRole: "ANCHOR_REPRESENTATION",
      languageScript: anchorScript,
      sourceQuestionNumber: anchorCandidate.sourceQuestionNumber,
      pageNumber: anchorCandidate.startPageNumber,
      directMembershipFingerprint: computeDeterministicHash(
        `anchor_membership:${anchorCandidate.physicalInstanceId}:${anchorCandidate.candidateId}`
      ),
      directRelationshipEvaluationId: void 0,
      directEvidenceReferences: []
    };
    const membersByPhysId = /* @__PURE__ */ new Map();
    membersByPhysId.set(anchorCandidate.physicalInstanceId, anchorMember);
    const directEvaluationIdsSet = /* @__PURE__ */ new Set();
    const sortedMemberships = [...relevantMemberships].sort(
      (a, b) => a.candidatePhysicalInstanceId.localeCompare(b.candidatePhysicalInstanceId)
    );
    for (const m of sortedMemberships) {
      if (m.candidatePhysicalInstanceId === anchorCandidate.physicalInstanceId) {
        continue;
      }
      for (const evalId of m.directRelationshipEvaluationIds || []) {
        directEvaluationIdsSet.add(evalId);
      }
      const cand = candPhysMap.get(m.candidatePhysicalInstanceId);
      const script = cand.languageRepresentations?.[0]?.languageScript || "LATIN";
      const isLanguageRep = script !== anchorScript || m.directEvidenceReferences.some(
        (e) => e.evidenceType === "DISTINCT_SCRIPT_DETECTION" || e.evidenceType === "FACING_PAGE_SPREAD_PAIR"
      );
      const representationRole = isLanguageRep ? "LANGUAGE_REPRESENTATION" : "LOGICAL_VIEW_REPRESENTATION";
      const member = {
        candidatePhysicalInstanceId: cand.physicalInstanceId,
        candidateId: cand.candidateId,
        representationRole,
        languageScript: script,
        sourceQuestionNumber: cand.sourceQuestionNumber,
        pageNumber: cand.startPageNumber,
        directMembershipFingerprint: m.membershipFingerprint,
        directRelationshipEvaluationId: m.directRelationshipEvaluationIds[0],
        directEvidenceReferences: [...m.directEvidenceReferences]
      };
      membersByPhysId.set(cand.physicalInstanceId, member);
    }
    const nonAnchorMembers = Array.from(membersByPhysId.values()).filter((m) => m.representationRole !== "ANCHOR_REPRESENTATION").sort((a, b) => a.candidatePhysicalInstanceId.localeCompare(b.candidatePhysicalInstanceId));
    const finalMembers = [anchorMember, ...nonAnchorMembers];
    const sortedDirectEvalIds = Array.from(directEvaluationIdsSet).sort();
    const memberPhysListStr = finalMembers.map((m) => m.candidatePhysicalInstanceId).join(",");
    const evalListStr = sortedDirectEvalIds.join(",");
    const familyId = computeDeterministicHash(
      `family:${anchorCandidate.physicalInstanceId}:${memberPhysListStr}:${evalListStr}`
    );
    const firstMembership = relevantMemberships[0];
    const provenance = {
      sourceSnapshotId: firstMembership?.provenance.sourceSnapshotId || input.sourceSnapshotId || "snapshot_unknown",
      sourceDocumentId: firstMembership?.provenance.sourceDocumentId || input.sourceDocumentId || "doc_unknown",
      algorithmId,
      algorithmVersion,
      synthesizedAt: 0
      // Deterministic epoch
    };
    synthesisReasons.push(
      `Logical family synthesized around anchor candidate ${anchorCandidate.candidateId} (Physical: ${anchorCandidate.physicalInstanceId}).`
    );
    synthesisReasons.push(
      `Total members: ${finalMembers.length} (${finalMembers.filter((m) => m.representationRole === "LANGUAGE_REPRESENTATION").length} language representations).`
    );
    synthesisReasons.push(
      `Direct evaluation IDs consumed: ${sortedDirectEvalIds.length}.`
    );
    const family = {
      familyId,
      anchorPhysicalInstanceId: anchorCandidate.physicalInstanceId,
      anchorCandidateId: anchorCandidate.candidateId,
      members: finalMembers,
      directRelationshipEvaluationIds: sortedDirectEvalIds,
      verificationStatus: "RELATIONSHIP_PROVEN",
      provenance,
      algorithmVersion,
      familyFingerprint: familyId,
      synthesisReasons
    };
    return {
      family,
      isSynthesized: true,
      rejectionReasons: [],
      synthesisReasons,
      deterministicFingerprint: familyId
    };
  }
  /**
   * Batch synthesis of logical families across all candidates and accepted memberships.
   * Pure function: groups memberships by anchor familyCandidateId without global graph clustering.
   */
  synthesizeBatchFamilies(input) {
    const candidateMap = /* @__PURE__ */ new Map();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));
    const anchorIds = /* @__PURE__ */ new Set();
    for (const m of input.acceptedMemberships || []) {
      if (m.isAccepted && m.familyCandidateId) {
        anchorIds.add(m.familyCandidateId);
      }
    }
    const families = [];
    const sortedAnchorIds = Array.from(anchorIds).sort();
    for (const anchorId of sortedAnchorIds) {
      const anchorCandidate = candidateMap.get(anchorId);
      if (!anchorCandidate) {
        continue;
      }
      const result = this.synthesizeFamily({
        anchorCandidate,
        acceptedMemberships: input.acceptedMemberships,
        allCandidates: input.candidates,
        sourceSnapshotId: input.sourceSnapshotId,
        sourceDocumentId: input.sourceDocumentId,
        algorithmId: input.algorithmId,
        algorithmVersion: input.algorithmVersion
      });
      if (result.isSynthesized && result.family) {
        families.push(result.family);
      }
    }
    return families.sort((a, b) => a.familyId.localeCompare(b.familyId));
  }
};

// src/services/uadue/canonical/canonicalQuestionSynthesizer.ts
var DEFAULT_CANONICALIZER_ALGORITHM_ID = "uadue_canonical_synthesizer_v4";
var DEFAULT_CANONICALIZER_VERSION = "4.0.0";
var SCHEMA_VERSION = "uadue-canonical-ir-v4.0.0";
var CanonicalQuestionSynthesizer = class {
  algorithmId;
  algorithmVersion;
  schemaVersion;
  constructor(algorithmId = DEFAULT_CANONICALIZER_ALGORITHM_ID, algorithmVersion = DEFAULT_CANONICALIZER_VERSION, schemaVersion = SCHEMA_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
    this.schemaVersion = schemaVersion;
  }
  /**
   * Synthesizes CanonicalQuestionIR from a LogicalQuestionFamily.
   * Pure function: does NOT mutate family or candidates.
   */
  synthesizeCanonicalQuestion(input) {
    const { family, candidates } = input;
    const algorithmId = input.canonicalizerAlgorithmId || this.algorithmId;
    const algorithmVersion = input.canonicalizerVersion || this.algorithmVersion;
    const rejectionReasons = [];
    const synthesisReasons = [];
    if (!family || !family.familyId || !family.members || family.members.length === 0) {
      rejectionReasons.push("Logical family is missing or contains no members.");
      const hash = computeDeterministicHash("canonical_rejected:missing_family");
      return {
        isCanonicalized: false,
        rejectionReasons,
        synthesisReasons: [],
        deterministicFingerprint: hash
      };
    }
    const candPhysMap = /* @__PURE__ */ new Map();
    for (const c of candidates || []) {
      candPhysMap.set(c.physicalInstanceId, c);
    }
    for (const member of family.members) {
      if (!candPhysMap.has(member.candidatePhysicalInstanceId)) {
        rejectionReasons.push(
          `Member physical candidate '${member.candidatePhysicalInstanceId}' not found in candidate pool.`
        );
      }
    }
    if (rejectionReasons.length > 0) {
      const sortedRejections = [...rejectionReasons].sort().join(";");
      const hash = computeDeterministicHash(
        `canonical_rejected:${family.familyId}:${sortedRejections}`
      );
      return {
        isCanonicalized: false,
        rejectionReasons,
        synthesisReasons: [],
        deterministicFingerprint: hash
      };
    }
    const representations = [];
    const allAssetMap = /* @__PURE__ */ new Map();
    const sortedMembers = [...family.members].sort((a, b) => {
      if (a.representationRole === "ANCHOR_REPRESENTATION") return -1;
      if (b.representationRole === "ANCHOR_REPRESENTATION") return 1;
      return a.candidatePhysicalInstanceId.localeCompare(b.candidatePhysicalInstanceId);
    });
    for (const member of sortedMembers) {
      const cand = candPhysMap.get(member.candidatePhysicalInstanceId);
      const memberRole = member.representationRole;
      const isPrimary = memberRole === "ANCHOR_REPRESENTATION";
      const baseProvenance = {
        sourcePhysicalCandidateId: cand.candidateId,
        sourcePhysicalInstanceId: cand.physicalInstanceId,
        sourcePhysicalNodeIds: [...cand.stemNodeIds || []],
        sourcePageNumber: cand.startPageNumber
      };
      const stemAST = [];
      const rawStemText = cand.languageRepresentations?.[0]?.stemNodeIds?.join(" ") || `[Source Candidate ${cand.candidateId} Stem]`;
      const textNode = {
        nodeId: `ast_text_${cand.physicalInstanceId}_stem`,
        nodeType: "TEXT",
        rawContent: rawStemText,
        normalizedContent: rawStemText.trim(),
        isSemanticInterpretationResolved: true,
        provenance: [baseProvenance]
      };
      stemAST.push(textNode);
      for (const mathId of cand.mathCandidateIds || []) {
        stemAST.push({
          nodeId: `ast_math_${cand.physicalInstanceId}_${mathId}`,
          nodeType: "MATH",
          rawContent: `[Visual Math Asset ${mathId}]`,
          isSemanticInterpretationResolved: false,
          unresolvedReasons: ["Visual math source preserved; structural LaTeX interpretation unverified."],
          provenance: [baseProvenance]
        });
      }
      for (const tableId of cand.tableCandidateIds || []) {
        stemAST.push({
          nodeId: `ast_table_${cand.physicalInstanceId}_${tableId}`,
          nodeType: "TABLE",
          rawContent: `[Visual Table Asset ${tableId}]`,
          isSemanticInterpretationResolved: false,
          unresolvedReasons: ["Table visual preserved; structural cell topology unverified."],
          provenance: [baseProvenance]
        });
      }
      const memberAssets = [];
      for (const diagId of cand.diagramCandidateIds || []) {
        const assetRef = {
          assetId: diagId,
          assetType: "DIAGRAM",
          sourcePageNumber: cand.startPageNumber,
          sourceNodeIds: [...cand.includedPhysicalNodeIds],
          isSemanticEquivalenceProven: false,
          provenance: baseProvenance
        };
        memberAssets.push(assetRef);
        allAssetMap.set(diagId, assetRef);
        stemAST.push({
          nodeId: `ast_diagram_${cand.physicalInstanceId}_${diagId}`,
          nodeType: "DIAGRAM",
          rawContent: `[Diagram Asset ${diagId}]`,
          isSemanticInterpretationResolved: false,
          unresolvedReasons: ["Diagram asset preserved; semantic interpretation unverified."],
          provenance: [baseProvenance]
        });
      }
      const options = [];
      for (let i = 0; i < (cand.optionCandidateIds || []).length; i++) {
        const optId = cand.optionCandidateIds[i];
        const optProvenance = {
          sourcePhysicalCandidateId: cand.candidateId,
          sourcePhysicalInstanceId: cand.physicalInstanceId,
          sourcePhysicalNodeIds: [optId],
          sourcePageNumber: cand.startPageNumber
        };
        const optNode = {
          nodeId: `ast_opt_${cand.physicalInstanceId}_${optId}`,
          nodeType: "TEXT",
          rawContent: `[Option ${optId}]`,
          normalizedContent: `[Option ${optId}]`.trim(),
          isSemanticInterpretationResolved: true,
          provenance: [optProvenance]
        };
        options.push({
          optionId: optId,
          sourceLabel: `(${String.fromCharCode(65 + i)})`,
          sourceRawText: `[Option ${optId}]`,
          normalizedText: `[Option ${optId}]`.trim(),
          astNodes: [optNode],
          associatedAssetIds: [],
          provenance: [optProvenance]
        });
      }
      const repId = computeDeterministicHash(
        `rep:${family.familyId}:${cand.physicalInstanceId}:${member.languageScript || "LATIN"}`
      );
      representations.push({
        representationId: repId,
        representationRole: memberRole,
        languageScript: member.languageScript,
        sourceQuestionNumber: member.sourceQuestionNumber,
        sourcePageNumber: member.pageNumber,
        sourcePhysicalInstanceId: cand.physicalInstanceId,
        sourceCandidateId: cand.candidateId,
        stemRawText: rawStemText,
        stemNormalizedText: rawStemText.trim(),
        stemAST,
        options,
        assets: memberAssets,
        isPrimary,
        provenance: {
          sourceSnapshotId: family.provenance.sourceSnapshotId,
          sourceDocumentId: family.provenance.sourceDocumentId,
          physicalNodeIds: [...cand.includedPhysicalNodeIds]
        }
      });
    }
    const printedNumbers = family.members.map((m) => m.sourceQuestionNumber).filter(Boolean);
    const hasNumberingDiscrepancy = new Set(printedNumbers).size > 1;
    const sourceNumberings = family.members.map((m) => ({
      candidatePhysicalInstanceId: m.candidatePhysicalInstanceId,
      printedQuestionNumber: m.sourceQuestionNumber,
      pageNumber: m.pageNumber
    }));
    const allAssetReferences = Array.from(allAssetMap.values()).sort(
      (a, b) => a.assetId.localeCompare(b.assetId)
    );
    const sortedMemberPhysIds = family.members.map((m) => m.candidatePhysicalInstanceId).sort().join(",");
    const sortedRepIds = representations.map((r) => r.representationId).sort().join(",");
    const canonicalQuestionId = computeDeterministicHash(
      `canonical_q:${family.familyId}:${sortedMemberPhysIds}:${sortedRepIds}`
    );
    const serializedContentPayload = representations.map((r) => {
      const astSummary = r.stemAST.map((n) => `${n.nodeType}:${n.rawContent}`).join("|");
      const optSummary = r.options.map((o) => `${o.sourceLabel || ""}:${o.sourceRawText}`).join("|");
      const assetSummary = r.assets.map((a) => a.assetId).join("|");
      return `${r.representationId}:${r.stemRawText}:${astSummary}:${optSummary}:${assetSummary}`;
    }).join(";;");
    const canonicalFingerprint = computeDeterministicHash(
      `canonical_content:${canonicalQuestionId}:${serializedContentPayload}`
    );
    const provenance = {
      sourceSnapshotId: input.sourceSnapshotId || family.provenance.sourceSnapshotId,
      sourceDocumentId: input.sourceDocumentId || family.provenance.sourceDocumentId,
      logicalFamilyId: family.familyId,
      canonicalizerAlgorithmId: algorithmId,
      canonicalizerVersion: algorithmVersion,
      schemaVersion: this.schemaVersion,
      synthesizedAt: 0
      // Deterministic epoch
    };
    synthesisReasons.push(
      `Canonical Question IR synthesized from Logical Family ${family.familyId}.`
    );
    synthesisReasons.push(
      `Preserved ${representations.length} representation views (${representations.filter((r) => r.isPrimary).length} primary anchor).`
    );
    if (hasNumberingDiscrepancy) {
      synthesisReasons.push(
        `Authentic source numbering discrepancy detected and preserved: [${sourceNumberings.map((n) => `${n.candidatePhysicalInstanceId}: Q${n.printedQuestionNumber}`).join(", ")}].`
      );
    }
    const canonicalQuestion = {
      canonicalQuestionId,
      logicalFamilyId: family.familyId,
      memberPhysicalInstanceIds: family.members.map((m) => m.candidatePhysicalInstanceId),
      sourceSnapshotId: provenance.sourceSnapshotId,
      sourceDocumentId: provenance.sourceDocumentId,
      directRelationshipEvaluationIds: [...family.directRelationshipEvaluationIds],
      representations,
      sourceDiscrepancies: {
        hasNumberingDiscrepancy,
        sourceNumberings
      },
      allAssetReferences,
      provenance,
      schemaVersion: this.schemaVersion,
      canonicalFingerprint,
      synthesisReasons
    };
    return {
      canonicalQuestion,
      isCanonicalized: true,
      rejectionReasons: [],
      synthesisReasons,
      deterministicFingerprint: canonicalFingerprint
    };
  }
  /**
   * Batch canonicalization across multiple logical families.
   * Pure function: operates strictly on supplied families without cross-family merging.
   */
  synthesizeBatchCanonicalQuestions(input) {
    const results = [];
    const sortedFamilies = [...input.families].sort(
      (a, b) => a.familyId.localeCompare(b.familyId)
    );
    for (const fam of sortedFamilies) {
      results.push(
        this.synthesizeCanonicalQuestion({
          family: fam,
          candidates: input.candidates,
          sourceSnapshotId: input.sourceSnapshotId,
          sourceDocumentId: input.sourceDocumentId,
          canonicalizerAlgorithmId: input.canonicalizerAlgorithmId,
          canonicalizerVersion: input.canonicalizerVersion
        })
      );
    }
    return results;
  }
};

// src/services/uadue/canonical/answerAuthorityResolver.ts
function evaluateLineageHead(canonicalQuestionId, familyVersions, conflictEvents = []) {
  const relevantVersions = familyVersions.filter(
    (v) => v.canonicalQuestionId === canonicalQuestionId
  );
  if (relevantVersions.length === 0) {
    return {
      status: "UNRESOLVED"
    };
  }
  const resolutionFamilyId = relevantVersions[0].resolutionFamilyId;
  const supersededByParent = /* @__PURE__ */ new Set();
  for (const v of relevantVersions) {
    if (v.supersedesVersionId) {
      supersededByParent.add(v.supersedesVersionId);
    }
  }
  const treeHeads = relevantVersions.filter(
    (v) => !supersededByParent.has(v.resolutionVersionId)
  );
  if (treeHeads.length === 0) {
    return {
      status: "UNRESOLVED"
    };
  }
  const supersededByConflict = /* @__PURE__ */ new Set();
  for (const event of conflictEvents) {
    if (event.resolutionFamilyId !== resolutionFamilyId) {
      continue;
    }
    const unifyingVer = relevantVersions.find(
      (v) => v.resolutionVersionId === event.unifyingResolutionVersionId
    );
    if (!unifyingVer || unifyingVer.verificationStatus !== "VERIFIED") {
      const conflictId = deriveConflictId({
        resolutionFamilyId,
        conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId)
      });
      return {
        status: "LINEAGE_CONFLICT",
        competingResolutionVersions: treeHeads,
        conflictRecord: {
          conflictId,
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
          conflictReason: `Conflict resolution event specifies invalid or unverified unifying resolution '${event.unifyingResolutionVersionId}'; fails closed`,
          detectedAt: Date.now(),
          isResolved: false
        }
      };
    }
    const referencedHeads = [...new Set(event.resolvedConflictHeadVersionIds || [])];
    for (const headId of referencedHeads) {
      const targetVer = relevantVersions.find((v) => v.resolutionVersionId === headId);
      if (!targetVer) {
        const conflictId = deriveConflictId({
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId)
        });
        return {
          status: "LINEAGE_CONFLICT",
          competingResolutionVersions: treeHeads,
          conflictRecord: {
            conflictId,
            resolutionFamilyId,
            conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
            conflictReason: `Conflict resolution event references non-existent / dangling resolution version '${headId}'; fails closed`,
            detectedAt: Date.now(),
            isResolved: false
          }
        };
      }
      const isCurrentTreeHead = treeHeads.some((th) => th.resolutionVersionId === headId);
      const isParentOfUnifying = unifyingVer.supersedesVersionId === headId;
      if (!isCurrentTreeHead && !isParentOfUnifying) {
        const conflictId = deriveConflictId({
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId)
        });
        return {
          status: "LINEAGE_CONFLICT",
          competingResolutionVersions: treeHeads,
          conflictRecord: {
            conflictId,
            resolutionFamilyId,
            conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
            conflictReason: `Conflict resolution event references unrelated historical version '${headId}' that is not an active competing head; fails closed`,
            detectedAt: Date.now(),
            isResolved: false
          }
        };
      }
      supersededByConflict.add(headId);
    }
  }
  const candidateHeads = relevantVersions.filter(
    (v) => !supersededByParent.has(v.resolutionVersionId) && !supersededByConflict.has(v.resolutionVersionId)
  );
  if (candidateHeads.length === 0) {
    return {
      status: "UNRESOLVED"
    };
  }
  if (candidateHeads.length === 1) {
    return {
      status: "AUTHORITATIVE",
      authoritativeResolution: candidateHeads[0]
    };
  }
  const conflictRecord = {
    conflictId: deriveConflictId({
      resolutionFamilyId,
      conflictingVersionIds: candidateHeads.map((h) => h.resolutionVersionId)
    }),
    resolutionFamilyId,
    conflictingVersionIds: candidateHeads.map((h) => h.resolutionVersionId).sort(),
    conflictReason: `Multiple competing lineage heads detected (${candidateHeads.length} heads); resolution failed closed`,
    detectedAt: Date.now(),
    isResolved: false
  };
  return {
    status: "LINEAGE_CONFLICT",
    competingResolutionVersions: candidateHeads,
    conflictRecord
  };
}

// src/services/uadue/canonical/canonicalValidationEngine.ts
var CanonicalValidationEngine = class {
  config;
  constructor(config = {}) {
    this.config = config;
  }
  /**
   * Validates an entire synthesized CanonicalAssessmentPackage against all formal invariants.
   */
  validatePackage(pkg, originalInput) {
    const invariantResults = [];
    let passedCount = 0;
    let failedCount = 0;
    const inv1 = this.validateInv1SourceNonDestruction(
      pkg,
      originalInput.questionGraph,
      originalInput.originalCandidatesSnapshot
    );
    invariantResults.push(inv1);
    inv1.isSatisfied ? passedCount++ : failedCount++;
    const inv2 = this.validateInv2TraceabilityCompleteness(pkg, originalInput.questionGraph);
    invariantResults.push(inv2);
    inv2.isSatisfied ? passedCount++ : failedCount++;
    const inv3 = this.validateInv3DiscrepancyHonesty(pkg);
    invariantResults.push(inv3);
    inv3.isSatisfied ? passedCount++ : failedCount++;
    const inv4 = this.validateInv4EvidenceDrivenVerification(pkg);
    invariantResults.push(inv4);
    inv4.isSatisfied ? passedCount++ : failedCount++;
    const inv5 = this.validateInv5AnswerDecoupling(pkg);
    invariantResults.push(inv5);
    inv5.isSatisfied ? passedCount++ : failedCount++;
    const inv6 = this.validateInv6BitwiseDeterminism(pkg);
    invariantResults.push(inv6);
    inv6.isSatisfied ? passedCount++ : failedCount++;
    const inv7 = this.validateInv7LineageHeadIntegrity(pkg);
    invariantResults.push(inv7);
    inv7.isSatisfied ? passedCount++ : failedCount++;
    let validationStatus = "PACKAGE_VALIDATED";
    if (failedCount > 0) {
      validationStatus = "PACKAGE_FAILED";
    } else {
      const hasQuarantined = pkg.canonicalQuestions.some(
        (q) => q.representations.some(
          (r) => r.stemAST.some((node) => !node.isSemanticInterpretationResolved)
        )
      );
      const hasLineageConflicts = Object.values(pkg.authoritativeAnswers).some(
        (res) => res.status === "LINEAGE_CONFLICT"
      );
      if (hasQuarantined || hasLineageConflicts) {
        validationStatus = "PACKAGE_REVIEW_REQUIRED";
      }
    }
    let discrepancyCount = 0;
    for (const q of pkg.canonicalQuestions) {
      if (q.sourceDiscrepancies.hasNumberingDiscrepancy) {
        discrepancyCount++;
      }
    }
    let authoritativeCount = 0;
    let conflictedCount = 0;
    for (const res of Object.values(pkg.authoritativeAnswers)) {
      if (res.status === "AUTHORITATIVE") authoritativeCount++;
      if (res.status === "LINEAGE_CONFLICT") conflictedCount++;
    }
    const reportId = computeCanonicalSha256("val_rpt", {
      packageId: pkg.packageId,
      passedCount,
      failedCount,
      validationStatus,
      invResults: invariantResults.map((r) => ({
        inv: r.invariantName,
        ok: r.isSatisfied
      }))
    });
    const validationFingerprint = computeCanonicalSha256("val_fp", {
      reportId,
      packageId: pkg.packageId,
      status: validationStatus
    });
    return {
      reportId,
      packageId: pkg.packageId,
      validationStatus,
      invariantsEvaluated: invariantResults,
      passedInvariantCount: passedCount,
      failedInvariantCount: failedCount,
      totalCanonicalQuestions: pkg.canonicalQuestions.length,
      validCanonicalQuestions: pkg.canonicalQuestions.length - (failedCount > 0 ? failedCount : 0),
      quarantinedQuestions: pkg.canonicalQuestions.filter(
        (q) => q.representations.some(
          (r) => r.stemAST.some((node) => !node.isSemanticInterpretationResolved)
        )
      ).length,
      totalLogicalFamilies: pkg.logicalFamilies.length,
      totalRelationshipEvaluations: pkg.relationshipEvaluations.length,
      totalMemberships: pkg.memberships.length,
      quarantinedRelationshipsCount: (pkg.quarantinedRelationships || []).length,
      authoritativeAnswerCount: authoritativeCount,
      conflictedAnswerCount: conflictedCount,
      discrepancyCount,
      validationFingerprint,
      validatedAt: Date.now()
    };
  }
  // ============================================================================
  // Invariant 1: Source Non-Destruction
  // ============================================================================
  validateInv1SourceNonDestruction(pkg, currentQuestionGraph, originalSnapshot) {
    const failureDetails = [];
    if (originalSnapshot && originalSnapshot.length > 0) {
      if (originalSnapshot.length !== currentQuestionGraph.questions.length) {
        failureDetails.push(
          `Question candidate count changed: original ${originalSnapshot.length}, current ${currentQuestionGraph.questions.length}`
        );
      }
      const origMap = /* @__PURE__ */ new Map();
      for (const orig of originalSnapshot) {
        origMap.set(orig.physicalInstanceId, orig);
      }
      for (const curr of currentQuestionGraph.questions) {
        const orig = origMap.get(curr.physicalInstanceId);
        if (!orig) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} was injected into QuestionGraph.`);
          continue;
        }
        if (orig.candidateId !== curr.candidateId) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} candidateId was mutated.`);
        }
        if (orig.includedPhysicalNodeIds.length !== curr.includedPhysicalNodeIds.length) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} includedPhysicalNodeIds array length mutated.`);
        }
        if (orig.optionCandidateIds.length !== curr.optionCandidateIds.length) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} optionCandidateIds array length mutated.`);
        }
      }
    }
    return {
      invariantName: "Inv1_SourceNonDestruction",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 2: Traceability Completeness
  // ============================================================================
  validateInv2TraceabilityCompleteness(pkg, questionGraph) {
    const failureDetails = [];
    const validCandidateInstanceIds = new Set(
      questionGraph.questions.map((q) => q.physicalInstanceId)
    );
    const validNodeIds = /* @__PURE__ */ new Set();
    for (const q of questionGraph.questions) {
      for (const nid of q.includedPhysicalNodeIds) {
        validNodeIds.add(nid);
      }
    }
    if (questionGraph.options) {
      for (const opt of questionGraph.options) {
        for (const nid of opt.contentNodeIds) {
          validNodeIds.add(nid);
        }
      }
    }
    for (const q of pkg.canonicalQuestions) {
      if (!q.canonicalQuestionId) {
        failureDetails.push("Canonical question missing canonicalQuestionId.");
      }
      if (!q.logicalFamilyId) {
        failureDetails.push(`Question ${q.canonicalQuestionId} missing logicalFamilyId.`);
      }
      for (const rep of q.representations) {
        if (!validCandidateInstanceIds.has(rep.sourcePhysicalInstanceId)) {
          failureDetails.push(
            `Question ${q.canonicalQuestionId} representation ${rep.representationId} references non-existent physical instance ${rep.sourcePhysicalInstanceId}`
          );
        }
        for (const astNode of rep.stemAST) {
          if (!astNode.provenance || astNode.provenance.length === 0) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} AST node ${astNode.nodeId} has empty provenance (UNRESOLVED_PROVENANCE)`
            );
          } else {
            for (const prov of astNode.provenance) {
              if (!validCandidateInstanceIds.has(prov.sourcePhysicalInstanceId)) {
                failureDetails.push(
                  `Question ${q.canonicalQuestionId} AST node ${astNode.nodeId} provenance points to invalid candidate ${prov.sourcePhysicalInstanceId}`
                );
              }
            }
          }
        }
        for (const opt of rep.options) {
          if (!opt.provenance || opt.provenance.length === 0) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} option ${opt.optionId} has empty provenance`
            );
          }
        }
      }
    }
    return {
      invariantName: "Inv2_TraceabilityCompleteness",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 3: Discrepancy Honesty
  // ============================================================================
  validateInv3DiscrepancyHonesty(pkg) {
    const failureDetails = [];
    for (const q of pkg.canonicalQuestions) {
      if (q.representations.length > 1) {
        const printedNums = /* @__PURE__ */ new Set();
        for (const rep of q.representations) {
          if (rep.sourceQuestionNumber) {
            printedNums.add(rep.sourceQuestionNumber.trim());
          }
        }
        if (printedNums.size > 1) {
          if (!q.sourceDiscrepancies.hasNumberingDiscrepancy) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} has multiple distinct printed numbers [${Array.from(printedNums).join(", ")}] but hasNumberingDiscrepancy is false (Silent Normalization Violation)`
            );
          }
          if (q.sourceDiscrepancies.sourceNumberings.length < printedNums.size) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} sourceDiscrepancies.sourceNumberings is incomplete.`
            );
          }
        }
      }
    }
    return {
      invariantName: "Inv3_DiscrepancyHonesty",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 4: Evidence-Driven Verification & Non-Transitivity
  // ============================================================================
  validateInv4EvidenceDrivenVerification(pkg) {
    const failureDetails = [];
    for (const rel of pkg.relationshipEvaluations) {
      if (rel.conflictingEvidence.length > 0 && rel.verificationStatus === "RELATIONSHIP_PROVEN") {
        failureDetails.push(
          `Relationship evaluation ${rel.evaluationId} marked PROVEN despite ${rel.conflictingEvidence.length} conflicting evidence items.`
        );
      }
      if (rel.relationshipType === "LANGUAGE_REPRESENTATION_OF" || rel.relationshipType === "VARIANT_OF" || rel.relationshipType === "SHARED_STIMULUS_CHILD_OF" || rel.relationshipType === "RELATED_BUT_DISTINCT") {
        if (rel.isTransitive) {
          failureDetails.push(
            `Relationship ${rel.evaluationId} of type ${rel.relationshipType} illegally declared transitive.`
          );
        }
      }
    }
    return {
      invariantName: "Inv4_EvidenceDrivenVerification",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 5: Answer Decoupling
  // ============================================================================
  validateInv5AnswerDecoupling(pkg) {
    const failureDetails = [];
    for (const q of pkg.canonicalQuestions) {
      if (q.canonicalQuestionId.includes("answer") || q.canonicalQuestionId.includes("ver_")) {
        failureDetails.push(
          `CanonicalQuestion ${q.canonicalQuestionId} identity appears coupled to answer data.`
        );
      }
    }
    return {
      invariantName: "Inv5_AnswerDecoupling",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 6: Bitwise Determinism & Zero-Float Arithmetic
  // ============================================================================
  validateInv6BitwiseDeterminism(pkg) {
    const failureDetails = [];
    if (!pkg.packageId || typeof pkg.packageId !== "string" || pkg.packageId.length !== 64) {
      failureDetails.push(`Invalid packageId format: expected 64-character hex string.`);
    }
    if (!pkg.packageIntegritySeal || typeof pkg.packageIntegritySeal !== "string" || pkg.packageIntegritySeal.length !== 64) {
      failureDetails.push(`Invalid packageIntegritySeal format: expected 64-character hex string.`);
    }
    try {
      const expectedPkgId = derivePackageId({
        sourceSnapshotId: pkg.sourceSnapshotId,
        sourceDocumentId: pkg.sourceDocumentId,
        canonicalQuestionIds: pkg.canonicalQuestions.map((q) => q.canonicalQuestionId),
        logicalFamilyIds: pkg.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: pkg.relationshipEvaluations.map((r) => r.evaluationId),
        membershipIds: pkg.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: (pkg.quarantinedRelationships || []).map((q) => q.relationshipId),
        schemaVersion: pkg.schemaVersion,
        pipelineAlgorithmId: pkg.pipelineAlgorithmId,
        pipelineAlgorithmVersion: pkg.pipelineAlgorithmVersion
      });
      if (pkg.packageId !== expectedPkgId) {
        failureDetails.push(
          `Structural Identity mismatch: expected ${expectedPkgId}, found ${pkg.packageId} (Bitwise Determinism Failure)`
        );
      }
      const expectedIntegritySeal = computePackageIntegritySeal({
        packageId: pkg.packageId,
        sourceSnapshotId: pkg.sourceSnapshotId,
        sourceDocumentId: pkg.sourceDocumentId,
        canonicalQuestions: pkg.canonicalQuestions,
        logicalFamilies: pkg.logicalFamilies,
        relationshipEvaluations: pkg.relationshipEvaluations,
        memberships: pkg.memberships,
        quarantinedRelationships: pkg.quarantinedRelationships || [],
        authoritativeAnswers: pkg.authoritativeAnswers,
        schemaVersion: pkg.schemaVersion,
        pipelineAlgorithmId: pkg.pipelineAlgorithmId,
        pipelineAlgorithmVersion: pkg.pipelineAlgorithmVersion
      });
      if (pkg.packageIntegritySeal !== expectedIntegritySeal) {
        failureDetails.push(
          `Package integrity seal mismatch: expected ${expectedIntegritySeal}, found ${pkg.packageIntegritySeal} (Content Integrity Failure)`
        );
      }
      if (pkg.sealedFingerprint && pkg.sealedFingerprint !== expectedIntegritySeal) {
        failureDetails.push(
          `Sealed fingerprint mismatch: expected ${expectedIntegritySeal}, found ${pkg.sealedFingerprint} (Content Integrity Failure)`
        );
      }
    } catch (err) {
      failureDetails.push(`RFC 8785 canonicalization failed: ${err.message}`);
    }
    return {
      invariantName: "Inv6_BitwiseDeterminism",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
  // ============================================================================
  // Invariant 7: Lineage Head Integrity
  // ============================================================================
  validateInv7LineageHeadIntegrity(pkg) {
    const failureDetails = [];
    for (const [qid, res] of Object.entries(pkg.authoritativeAnswers)) {
      if (res.status === "AUTHORITATIVE") {
        if (!res.authoritativeResolution) {
          failureDetails.push(`Question ${qid} marked AUTHORITATIVE but authoritativeResolution is null.`);
        }
      } else if (res.status === "LINEAGE_CONFLICT") {
        if (!res.competingResolutionVersions || res.competingResolutionVersions.length <= 1) {
          failureDetails.push(
            `Question ${qid} marked LINEAGE_CONFLICT but competingResolutionVersions has <= 1 heads.`
          );
        }
      } else if (res.status === "UNRESOLVED") {
        if (res.authoritativeResolution) {
          failureDetails.push(`Question ${qid} marked UNRESOLVED but has authoritativeResolution attached.`);
        }
      }
    }
    return {
      invariantName: "Inv7_LineageHeadIntegrity",
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : void 0
    };
  }
};

// src/services/uadue/canonical/canonicalPipelineOrchestrator.ts
var DEFAULT_PIPELINE_ALGORITHM_ID = "uadue_canonical_pipeline_orchestrator_v6";
var DEFAULT_PIPELINE_ALGORITHM_VERSION = "6.0.0";
var DEFAULT_SCHEMA_VERSION = "uadue-canonical-package-v6.0.0";
var MAX_CANDIDATES_PER_PACKAGE = 5e3;
var MAX_RELATIONSHIPS_PER_PACKAGE = 25e3;
var CanonicalPipelineOrchestrator = class {
  algorithmId;
  algorithmVersion;
  schemaVersion;
  relEngine;
  membershipEvaluator;
  familySynthesizer;
  canonicalSynthesizer;
  validationEngine;
  constructor(algorithmId = DEFAULT_PIPELINE_ALGORITHM_ID, algorithmVersion = DEFAULT_PIPELINE_ALGORITHM_VERSION, schemaVersion = DEFAULT_SCHEMA_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
    this.schemaVersion = schemaVersion;
    this.relEngine = new RelationshipEvaluationEngine(algorithmId, algorithmVersion);
    this.membershipEvaluator = new CandidateFamilyMembershipEvaluator(algorithmId, algorithmVersion);
    this.familySynthesizer = new LogicalFamilySynthesizer(algorithmId, algorithmVersion);
    this.canonicalSynthesizer = new CanonicalQuestionSynthesizer(
      algorithmId,
      algorithmVersion,
      schemaVersion
    );
    this.validationEngine = new CanonicalValidationEngine();
  }
  /**
   * Executes the full canonical ingestion and validation pipeline.
   * Pure function: Does NOT mutate input questionGraph, candidates, or relationships.
   */
  executePipeline(input) {
    const executionErrors = [];
    const executionWarnings = [];
    if (!input || !input.questionGraph) {
      executionErrors.push("Missing mandatory input: questionGraph is undefined.");
      return this.createFailureResult(executionErrors, executionWarnings);
    }
    const { questionGraph } = input;
    const candidates = questionGraph.questions || [];
    const relationships = questionGraph.relationships || [];
    if (candidates.length > MAX_CANDIDATES_PER_PACKAGE) {
      executionErrors.push(
        `Candidate count ${candidates.length} exceeds MAX_CANDIDATES_PER_PACKAGE (${MAX_CANDIDATES_PER_PACKAGE}) (Resource Limit Guard)`
      );
      return this.createFailureResult(executionErrors, executionWarnings);
    }
    if (relationships.length > MAX_RELATIONSHIPS_PER_PACKAGE) {
      executionErrors.push(
        `Relationship count ${relationships.length} exceeds MAX_RELATIONSHIPS_PER_PACKAGE (${MAX_RELATIONSHIPS_PER_PACKAGE}) (Resource Limit Guard)`
      );
      return this.createFailureResult(executionErrors, executionWarnings);
    }
    const originalCandidatesSnapshot = candidates.map((c) => ({ ...c }));
    const uniqueCandidatesMap = /* @__PURE__ */ new Map();
    for (const c of candidates) {
      if (!uniqueCandidatesMap.has(c.physicalInstanceId)) {
        uniqueCandidatesMap.set(c.physicalInstanceId, c);
      }
    }
    const deduplicatedCandidates = Array.from(uniqueCandidatesMap.values());
    const sortedCandidates = deduplicatedCandidates.sort((a, b) => {
      const cmp = a.candidateId.localeCompare(b.candidateId);
      return cmp !== 0 ? cmp : a.physicalInstanceId.localeCompare(b.physicalInstanceId);
    });
    const candIdMap = /* @__PURE__ */ new Map();
    const candPhysMap = /* @__PURE__ */ new Map();
    for (const c of sortedCandidates) {
      candIdMap.set(c.candidateId, c);
      candPhysMap.set(c.physicalInstanceId, c);
    }
    const relationshipEvaluations = [];
    const quarantinedRelationships = [];
    const sortedRelationships = [...relationships].sort(
      (a, b) => a.relationshipId.localeCompare(b.relationshipId)
    );
    for (const rel of sortedRelationships) {
      const sourceCandidate = candIdMap.get(rel.sourceCandidateId) || candPhysMap.get(rel.sourceCandidateId);
      const targetCandidate = candIdMap.get(rel.targetCandidateId) || candPhysMap.get(rel.targetCandidateId);
      if (!sourceCandidate || !targetCandidate) {
        let quarantineReason = "INVALID_RELATIONSHIP_STRUCTURE";
        if (!sourceCandidate && !targetCandidate) {
          quarantineReason = "DANGLING_BOTH_CANDIDATES";
        } else if (!sourceCandidate) {
          quarantineReason = "DANGLING_SOURCE_CANDIDATE";
        } else {
          quarantineReason = "DANGLING_TARGET_CANDIDATE";
        }
        quarantinedRelationships.push({
          relationshipId: rel.relationshipId,
          sourceCandidateId: rel.sourceCandidateId,
          targetCandidateId: rel.targetCandidateId,
          relationshipType: rel.relationshipType,
          quarantineReason,
          quarantinedAt: 0
          // Deterministic epoch
        });
        executionWarnings.push(
          `Relationship ${rel.relationshipId} quarantined (${quarantineReason}): source=${rel.sourceCandidateId}, target=${rel.targetCandidateId}`
        );
        continue;
      }
      const evalResult = this.relEngine.evaluateRelationship({
        relationship: rel,
        sourceCandidate,
        targetCandidate
      });
      relationshipEvaluations.push(evalResult);
    }
    relationshipEvaluations.sort((a, b) => a.evaluationId.localeCompare(b.evaluationId));
    quarantinedRelationships.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
    const acceptedMemberships = [];
    const eligibleEvaluations = relationshipEvaluations.filter(
      (e) => e.isEligibleForFamilySynthesis && e.verificationStatus === "RELATIONSHIP_PROVEN"
    );
    for (const evalResult of eligibleEvaluations) {
      const candidate = candPhysMap.get(evalResult.sourcePhysicalInstanceId);
      const familyTargetCandidate = candPhysMap.get(evalResult.targetPhysicalInstanceId);
      if (!candidate || !familyTargetCandidate) {
        continue;
      }
      const memberResult = this.membershipEvaluator.evaluateMembership({
        candidate,
        familyTargetCandidate,
        directRelationshipEvaluation: evalResult
      });
      if (memberResult.isAccepted && memberResult.membership) {
        acceptedMemberships.push(memberResult.membership);
      }
      if (evalResult.isSymmetric) {
        const reciprocalResult = this.membershipEvaluator.evaluateMembership({
          candidate: familyTargetCandidate,
          familyTargetCandidate: candidate,
          directRelationshipEvaluation: evalResult
        });
        if (reciprocalResult.isAccepted && reciprocalResult.membership) {
          acceptedMemberships.push(reciprocalResult.membership);
        }
      }
    }
    const uniqueMembershipsMap = /* @__PURE__ */ new Map();
    for (const m of acceptedMemberships) {
      uniqueMembershipsMap.set(m.membershipFingerprint, m);
    }
    const finalMemberships = Array.from(uniqueMembershipsMap.values()).sort(
      (a, b) => a.membershipFingerprint.localeCompare(b.membershipFingerprint)
    );
    const logicalFamilies = [];
    const groupedAnchorIds = /* @__PURE__ */ new Set();
    for (const m of finalMemberships) {
      if (m.familyCandidateId) {
        groupedAnchorIds.add(m.familyCandidateId);
      }
    }
    const sortedAnchorIds = Array.from(groupedAnchorIds).sort();
    const candidateIdsInFamilies = /* @__PURE__ */ new Set();
    for (const anchorId of sortedAnchorIds) {
      const anchorCandidate = candIdMap.get(anchorId);
      if (!anchorCandidate) {
        continue;
      }
      if (candidateIdsInFamilies.has(anchorCandidate.physicalInstanceId)) {
        continue;
      }
      const familyResult = this.familySynthesizer.synthesizeFamily({
        anchorCandidate,
        acceptedMemberships: finalMemberships,
        allCandidates: sortedCandidates
      });
      if (familyResult.isSynthesized && familyResult.family) {
        logicalFamilies.push(familyResult.family);
        for (const member of familyResult.family.members) {
          candidateIdsInFamilies.add(member.candidatePhysicalInstanceId);
        }
      }
    }
    for (const cand of sortedCandidates) {
      if (!candidateIdsInFamilies.has(cand.physicalInstanceId)) {
        const singletonResult = this.familySynthesizer.synthesizeFamily({
          anchorCandidate: cand,
          acceptedMemberships: [],
          allCandidates: sortedCandidates
        });
        if (singletonResult.isSynthesized && singletonResult.family) {
          logicalFamilies.push(singletonResult.family);
          candidateIdsInFamilies.add(cand.physicalInstanceId);
        }
      }
    }
    logicalFamilies.sort((a, b) => a.familyId.localeCompare(b.familyId));
    const canonicalQuestions = [];
    for (const family of logicalFamilies) {
      const irResult = this.canonicalSynthesizer.synthesizeCanonicalQuestion({
        family,
        candidates: sortedCandidates
      });
      if (irResult.isCanonicalized && irResult.canonicalQuestion) {
        canonicalQuestions.push(irResult.canonicalQuestion);
      } else {
        executionWarnings.push(
          `Family ${family.familyId} canonicalization rejected: ${irResult.rejectionReasons.join("; ")}`
        );
      }
    }
    canonicalQuestions.sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId));
    const authoritativeAnswers = {};
    const resolutionVersions = input.resolutionVersions || [];
    const conflictEvents = input.conflictResolutionEvents || [];
    for (const q of canonicalQuestions) {
      const qVersions = resolutionVersions.filter(
        (v) => v.canonicalQuestionId === q.canonicalQuestionId
      );
      if (qVersions.length > 0) {
        authoritativeAnswers[q.canonicalQuestionId] = evaluateLineageHead(
          q.canonicalQuestionId,
          qVersions,
          conflictEvents
        );
      } else {
        authoritativeAnswers[q.canonicalQuestionId] = {
          status: "UNRESOLVED"
        };
      }
    }
    const sourceSnapshotId = questionGraph.sourceSnapshotId || questionGraph.provenance?.sourceSnapshotId || "snapshot_unknown";
    const sourceDocumentId = questionGraph.sourceDocumentId || questionGraph.provenance?.sourceDocumentId || "doc_unknown";
    const pipelineAlgorithmId = input.algorithmId || this.algorithmId;
    const pipelineAlgorithmVersion = input.algorithmVersion || this.algorithmVersion;
    const schemaVersion = input.schemaVersion || this.schemaVersion;
    const packageId = derivePackageId({
      sourceSnapshotId,
      sourceDocumentId,
      canonicalQuestionIds: canonicalQuestions.map((q) => q.canonicalQuestionId),
      logicalFamilyIds: logicalFamilies.map((f) => f.familyId),
      relationshipEvaluationIds: relationshipEvaluations.map((r) => r.evaluationId),
      membershipIds: finalMemberships.map((m) => m.membershipFingerprint),
      quarantinedRelationshipIds: quarantinedRelationships.map((q) => q.relationshipId),
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion
    });
    const packageIntegritySeal = computePackageIntegritySeal({
      packageId,
      sourceSnapshotId,
      sourceDocumentId,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships: finalMemberships,
      quarantinedRelationships,
      authoritativeAnswers,
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion
    });
    const preliminaryPackage = {
      packageId,
      sourceSnapshotId,
      sourceDocumentId,
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships: finalMemberships,
      quarantinedRelationships,
      authoritativeAnswers,
      validationReport: {},
      // filled in Stage 7
      packageIntegritySeal,
      sealedFingerprint: packageIntegritySeal,
      sealedAt: 0
      // Deterministic epoch
    };
    const validationReport = this.validationEngine.validatePackage(preliminaryPackage, {
      questionGraph,
      originalCandidatesSnapshot
    });
    preliminaryPackage.validationReport = validationReport;
    let isSuccess = true;
    if (input.strictValidation && validationReport.validationStatus === "PACKAGE_FAILED") {
      isSuccess = false;
      executionErrors.push(
        `Package invariant validation failed with ${validationReport.failedInvariantCount} failed invariants.`
      );
    }
    return {
      isSuccess,
      package: preliminaryPackage,
      validationReport,
      executionErrors,
      executionWarnings
    };
  }
  createFailureResult(errors, warnings) {
    const reportId = computeCanonicalSha256("val_rpt_fail", { errors });
    return {
      isSuccess: false,
      validationReport: {
        reportId,
        packageId: "none",
        validationStatus: "PACKAGE_FAILED",
        invariantsEvaluated: [],
        passedInvariantCount: 0,
        failedInvariantCount: errors.length,
        totalCanonicalQuestions: 0,
        validCanonicalQuestions: 0,
        quarantinedQuestions: 0,
        totalLogicalFamilies: 0,
        totalRelationshipEvaluations: 0,
        totalMemberships: 0,
        quarantinedRelationshipsCount: 0,
        authoritativeAnswerCount: 0,
        conflictedAnswerCount: 0,
        discrepancyCount: 0,
        validationFingerprint: "none",
        validatedAt: 0
      },
      executionErrors: errors,
      executionWarnings: warnings
    };
  }
};

// src/services/uadue/canonical/canonicalPostgresBenchmark.ts
async function runPostgresBenchmark(iterations = 30) {
  const pool = new Pool2({
    host: "localhost",
    port: 5432,
    database: "mockai_uadue_test",
    user: process.env.USER || "postgres",
    max: 20
  });
  const adapter = new CanonicalPostgresPersistenceAdapter(pool);
  const orchestrator = new CanonicalPipelineOrchestrator();
  const createCandidate = (candidateId, physicalInstanceId) => ({
    candidateId,
    physicalInstanceId,
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId,
      numberType: "QUESTION_NUMBER",
      confidence: 1,
      supportingEvidenceIds: []
    },
    includedPhysicalNodeIds: [`node_${candidateId}`],
    stemNodeIds: [`node_${candidateId}`],
    bodyNodeIds: [],
    optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`],
    stimulusRefIds: [],
    tableCandidateIds: [],
    diagramCandidateIds: [],
    mathCandidateIds: [],
    codeCandidateIds: [],
    observationState: "OBSERVED",
    verificationStatus: "SUPPORTED",
    confidenceScore: 0.95,
    evidenceList: [],
    unresolvedAmbiguityIds: [],
    languageRepresentations: [
      {
        languageScript: "LATIN",
        pageNumber: 1,
        stemNodeIds: [`node_${candidateId}`],
        bodyNodeIds: [],
        optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`]
      }
    ]
  });
  const createQuestionGraph = (id, questions) => ({
    graphId: `qgraph_bench_${id}`,
    sourceDocumentId: `doc_bench_${id}`,
    sourceSnapshotId: `snap_bench_${id}`,
    sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sourceDocumentGraphId: `docgraph_bench_${id}`,
    sourceDocumentGraphSha256: "f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    schemaVersion: "uadue-qg-v3",
    algorithmVersion: "3.0.0",
    configurationVersion: "1.0.0",
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: `opt_${questions[0]?.candidateId || "1"}_1`,
        contentNodeIds: ["node_opt_1"],
        candidateOwners: [],
        isMultiColumnOption: false,
        hasVisualAsset: false,
        hasMathematics: false,
        observationState: "OBSERVED",
        verificationStatus: "SUPPORTED",
        confidenceScore: 1,
        supportingEvidenceIds: []
      }
    ],
    tables: [],
    diagrams: [],
    mathBlocks: [],
    hypotheses: [],
    activeHypothesisId: "hyp_1",
    ambiguities: [],
    relationships: [],
    verificationState: {
      status: "VERIFIED",
      decisionLog: [],
      ambiguityCount: 0,
      verifiedConfidence: 0.95,
      isConsistent: true,
      unresolvedAmbiguities: []
    }
  });
  const persistTimes = [];
  const reconstructTimes = [];
  const publicationTimes = [];
  const sealTimes = [];
  try {
    for (let i = 0; i < iterations; i++) {
      const q = createCandidate(`c_bench_${i}`, `inst_bench_${i}`);
      const qgraph = createQuestionGraph(`b_${i}`, [q]);
      const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package;
      const t0 = performance.now();
      await adapter.persistPackage(pkg);
      const t1 = performance.now();
      persistTimes.push(t1 - t0);
      const t2 = performance.now();
      const reconstructed = await adapter.reconstructPackage(pkg.packageId);
      const t3 = performance.now();
      reconstructTimes.push(t3 - t2);
      const t4 = performance.now();
      derivePackageId({
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestionIds: reconstructed.canonicalQuestions.map((q2) => q2.canonicalQuestionId),
        logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
        membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion
      });
      computePackageIntegritySeal({
        packageId: reconstructed.packageId,
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestions: reconstructed.canonicalQuestions,
        logicalFamilies: reconstructed.logicalFamilies,
        relationshipEvaluations: reconstructed.relationshipEvaluations,
        memberships: reconstructed.memberships,
        quarantinedRelationships: reconstructed.quarantinedRelationships,
        authoritativeAnswers: reconstructed.authoritativeAnswers,
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion
      });
      const t5 = performance.now();
      sealTimes.push(t5 - t4);
      const t6 = performance.now();
      await adapter.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: `BENCH_AUTHORITY_${i}`,
        targetScope: "GLOBAL"
      });
      const t7 = performance.now();
      publicationTimes.push(t7 - t6);
    }
    const benchQ = createCandidate("c_contention", "inst_contention");
    const benchPkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph("contention", [benchQ]), strictValidation: true }).package;
    await adapter.persistPackage(benchPkg);
    const contentionStart = performance.now();
    await Promise.all(
      Array.from(
        { length: 50 },
        () => adapter.publishPackage({
          packageId: benchPkg.packageId,
          packageIntegritySeal: benchPkg.packageIntegritySeal,
          publicationAuthorityId: "CONTENTION_BOARD",
          targetScope: "STUDENT_ALL_INDIA"
        })
      )
    );
    const contentionEnd = performance.now();
    const contentionDurationSec = (contentionEnd - contentionStart) / 1e3;
    const contentionThroughputOpsPerSec = 50 / contentionDurationSec;
    const calcPercentile = (arr, p) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(Math.floor(p / 100 * sorted.length), sorted.length - 1);
      return sorted[idx];
    };
    return {
      persistLatencyP50Ms: Number(calcPercentile(persistTimes, 50).toFixed(2)),
      persistLatencyP95Ms: Number(calcPercentile(persistTimes, 95).toFixed(2)),
      persistLatencyMaxMs: Number(Math.max(...persistTimes).toFixed(2)),
      reconstructLatencyP50Ms: Number(calcPercentile(reconstructTimes, 50).toFixed(2)),
      reconstructLatencyP95Ms: Number(calcPercentile(reconstructTimes, 95).toFixed(2)),
      reconstructLatencyMaxMs: Number(Math.max(...reconstructTimes).toFixed(2)),
      publicationLatencyP50Ms: Number(calcPercentile(publicationTimes, 50).toFixed(2)),
      publicationLatencyP95Ms: Number(calcPercentile(publicationTimes, 95).toFixed(2)),
      contentionThroughputOpsPerSec: Number(contentionThroughputOpsPerSec.toFixed(1)),
      dualSealVerificationLatencyP50Ms: Number(calcPercentile(sealTimes, 50).toFixed(3))
    };
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("canonicalPostgresBenchmark.ts") || process.argv[1]?.endsWith("canonicalPostgresBenchmark.mjs")) {
  runPostgresBenchmark(20).then((res) => {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  }).catch((err) => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  });
}
export {
  runPostgresBenchmark
};
