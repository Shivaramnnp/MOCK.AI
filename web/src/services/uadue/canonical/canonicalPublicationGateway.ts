/**
 * UADUE Phase 2D-7 — Transactional Publication Gateway & Idempotency Engine
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Inviolable Publication Rules:
 * 1. ZERO random UUIDs or wall-clock timestamps in semantic identity.
 * 2. receiptId derived deterministically from domain inputs: SHA256(pub_receipt: packageId, seal, authorityId, seq).
 * 3. publication_request_fingerprint is physically persisted and mandatory on PUBLICATION_ISSUED.
 * 4. Idempotency: identical request fingerprint returns existing receipt with zero mutations.
 * 5. Conflict: differing fingerprint or authority throws PublicationConflictError (409).
 * 6. Concurrency: serialized via transactional package row lock (survives 100 concurrent workers).
 * 7. Rollback safety: failed transactions burn zero sequence numbers.
 */

import { createHmac } from 'crypto';
import { computeCanonicalSha256 } from './canonicalHashing';
import {
  PublicationRequestPayload,
  CanonicalPublicationReceipt,
  CanonicalPackageEvent,
} from './canonicalPersistenceTypes';
import { InvalidLifecycleTransitionError } from './canonicalLifecycleEngine';

export class PublicationConflictError extends Error {
  public readonly status = 409;
  constructor(public readonly packageId: string, details: string) {
    super(`Publication Conflict (409) for package ${packageId}: ${details}`);
    this.name = 'PublicationConflictError';
  }
}

export function computePublicationRequestFingerprint(req: PublicationRequestPayload): string {
  return computeCanonicalSha256('pub_req', {
    packageId: req.packageId,
    packageIntegritySeal: req.packageIntegritySeal,
    publicationAuthorityId: req.publicationAuthorityId,
    targetScope: req.targetScope,
    publicationPolicyConfig: req.publicationPolicyConfig ?? {},
  });
}

export class CanonicalPublicationGateway {
  constructor(
    private readonly persistenceAdapter: any,
    private readonly serviceSigningSecret: string = 'uadue-phase2d7-default-hmac-secret-key-32b'
  ) {}

  /**
   * Publishes an assessment package with strict transactional serialization and idempotency.
   */
  public async publishPackage(request: PublicationRequestPayload): Promise<CanonicalPublicationReceipt> {
    const { packageId, packageIntegritySeal, publicationAuthorityId, targetScope, publicationPolicyConfig } = request;

    // Acquire exclusive package row lock to serialize concurrent requests
    const unlock = await this.persistenceAdapter.acquirePackageLock(packageId);

    try {
      const currentState = this.persistenceAdapter.getPackageLifecycleState(packageId);
      const incomingFingerprint = computePublicationRequestFingerprint(request);
      const packageEvents = this.persistenceAdapter.getEventsForPackage(packageId);

      // 1. Idempotency & Conflict Check if already PUBLISHED
      if (currentState === 'PUBLISHED') {
        const publishedEvents = packageEvents.filter((e: CanonicalPackageEvent) => e.eventType === 'PUBLICATION_ISSUED');
        const latestPubEvent = publishedEvents[publishedEvents.length - 1];

        if (!latestPubEvent) {
          throw new PublicationConflictError(
            packageId,
            'State is PUBLISHED but no PUBLICATION_ISSUED event was found in ledger.'
          );
        }

        // Compare persistent publication_request_fingerprint
        if (latestPubEvent.publicationRequestFingerprint === incomingFingerprint) {
          // IDENTICAL RETRY: Return existing receipt idempotently
          return this.reconstructReceiptFromEvent(latestPubEvent, packageIntegritySeal);
        } else {
          // CONFLICTING REQUEST: Differing payload, scope, policy, or authority
          throw new PublicationConflictError(
            packageId,
            `Publication request conflicts with active publication. Persistent fingerprint is ${latestPubEvent.publicationRequestFingerprint}, incoming is ${incomingFingerprint}.`
          );
        }
      }

      // 2. Lifecycle State Precondition: Package must be VALIDATED
      if (currentState !== 'VALIDATED') {
        throw new InvalidLifecycleTransitionError(
          currentState,
          'PUBLICATION_ISSUED',
          `Cannot publish package in state ${currentState}. Package must be in VALIDATED state before publication.`
        );
      }

      // 3. Atomically Calculate Monotonic Sequence Numbers
      const priorPubCount = packageEvents.filter((e: CanonicalPackageEvent) => e.eventType === 'PUBLICATION_ISSUED').length;
      const publicationSequenceNumber = priorPubCount + 1; // 1 for first publication, 2 for post-quarantine re-publication

      // 4. Deterministic Receipt Identity
      const receiptId = computeCanonicalSha256('pub_receipt', {
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber,
      });

      // 5. Cryptographic Service Authentication Signature (HMAC-SHA256)
      const hmacSignature = createHmac('sha256', this.serviceSigningSecret).update(receiptId).digest('hex');

      const publishedAt = new Date().toISOString();

      const receiptPayload: CanonicalPublicationReceipt = {
        receiptId,
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber,
        publicationRequestFingerprint: incomingFingerprint,
        publishedAt,
        hmacSignature,
      };

      // 6. Append PUBLICATION_ISSUED event with PHYSICALLY PERSISTED fingerprint column
      await this.persistenceAdapter.appendLifecycleEvent(
        packageId,
        'PUBLICATION_ISSUED',
        {
          receiptId,
          publicationAuthorityId,
          publicationSequenceNumber,
          targetScope,
          publicationPolicyConfig: publicationPolicyConfig ?? {},
          publishedAt,
          hmacSignature,
        },
        incomingFingerprint, // Physically stored in canonical_package_events.publication_request_fingerprint
        true // skipLock: already locked by publishPackage transaction
      );

      return receiptPayload;
    } finally {
      unlock();
    }
  }

  private reconstructReceiptFromEvent(
    event: CanonicalPackageEvent,
    expectedSeal: string
  ): CanonicalPublicationReceipt {
    const payload = event.eventPayload;
    return {
      receiptId: payload.receiptId as string,
      packageId: event.packageId,
      packageIntegritySeal: expectedSeal,
      publicationAuthorityId: payload.publicationAuthorityId as string,
      publicationSequenceNumber: payload.publicationSequenceNumber as number,
      publicationRequestFingerprint: event.publicationRequestFingerprint as string,
      publishedAt: payload.publishedAt as string,
      hmacSignature: payload.hmacSignature as string,
    };
  }

  /**
   * Verifies the cryptographic service authentication of a publication receipt.
   */
  public verifyReceiptSignature(receipt: CanonicalPublicationReceipt): boolean {
    const expectedHmac = createHmac('sha256', this.serviceSigningSecret).update(receipt.receiptId).digest('hex');
    return expectedHmac === receipt.hmacSignature;
  }
}
