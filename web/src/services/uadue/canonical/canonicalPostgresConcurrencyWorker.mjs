// src/services/uadue/canonical/canonicalPostgresConcurrencyWorker.ts
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
      await client.query("COMMIT");
      return candidateEvent;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
      await this.appendLifecycleEvent(predecessorPackageId, "SUPERSESSION_REGISTERED", {
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
};

// src/services/uadue/canonical/canonicalPostgresConcurrencyWorker.ts
async function runWorker() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : "";
  };
  const packageId = getArg("--packageId");
  const packageIntegritySeal = getArg("--packageIntegritySeal");
  const workerId = getArg("--workerId") || "0";
  const isConflicting = getArg("--isConflicting") === "true";
  if (!packageId || !packageIntegritySeal) {
    process.stderr.write("Missing required args --packageId or --packageIntegritySeal\n");
    process.exit(1);
  }
  const pool = new Pool2({
    host: "localhost",
    port: 5432,
    database: "mockai_uadue_test",
    user: process.env.USER || "postgres",
    max: 2
  });
  const adapter = new CanonicalPostgresPersistenceAdapter(pool);
  try {
    const payload = isConflicting ? {
      packageId,
      packageIntegritySeal,
      publicationAuthorityId: `MULTI_PROC_AUTHORITY_${workerId}`,
      targetScope: `SCOPE_${workerId}`,
      publicationPolicyConfig: { processId: process.pid, workerId }
    } : {
      packageId,
      packageIntegritySeal,
      publicationAuthorityId: "MULTI_PROC_OFFICIAL_BOARD",
      targetScope: "STUDENT_ALL_INDIA",
      publicationPolicyConfig: { allowLateSubmission: false, maxAttempts: 1 }
    };
    const receipt = await adapter.publishPackage(payload);
    process.stdout.write(
      JSON.stringify({
        workerId,
        pid: process.pid,
        success: true,
        receiptId: receipt.receiptId,
        publicationRequestFingerprint: receipt.publicationRequestFingerprint,
        publicationSequenceNumber: receipt.publicationSequenceNumber
      }) + "\n"
    );
  } catch (err) {
    const isConflict = err instanceof PublicationConflictError || err.name === "PublicationConflictError";
    process.stdout.write(
      JSON.stringify({
        workerId,
        pid: process.pid,
        success: false,
        isConflict,
        errorName: err.name || "Error",
        errorMessage: err.message || String(err)
      }) + "\n"
    );
  } finally {
    await pool.end();
  }
}
runWorker().catch((e) => {
  process.stderr.write(`Worker fatal: ${e.message}
`);
  process.exit(1);
});
