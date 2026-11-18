/**
 * UADUE Phase 2D-7 — Canonical Lifecycle Finite State Machine & History Fold Reducer
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Inviolable Lifecycle Rules:
 * 1. Initial state is strictly DRAFT prior to persistence commit.
 * 2. Current state is derived strictly by folding the immutable event history in sequence order.
 * 3. Validation failure quarantine (origin=PERSISTED) is strictly IRREVERSIBLE (Option A).
 * 4. Administrative hold quarantine (origin=VALIDATED or origin=PUBLISHED) is reversible via QUARANTINE_RELEASED.
 * 5. SUPERSEDED is strictly a TERMINAL, IRREVERSIBLE state.
 * 6. Any invalid transition fails closed immediately.
 */

import {
  CanonicalPackageLifecycleState,
  CanonicalPackageEventType,
  CanonicalPackageEvent,
  QuarantineOriginState,
} from './canonicalPersistenceTypes';

export class InvalidLifecycleTransitionError extends Error {
  constructor(
    public readonly currentState: CanonicalPackageLifecycleState,
    public readonly eventType: CanonicalPackageEventType,
    public readonly details: string
  ) {
    super(`Lifecycle Violation: Cannot transition from ${currentState} via ${eventType}: ${details}`);
    this.name = 'InvalidLifecycleTransitionError';
  }
}

export class CorruptedEventStreamError extends Error {
  constructor(public readonly packageId: string, details: string) {
    super(`Corrupted Event Stream for package ${packageId}: ${details}`);
    this.name = 'CorruptedEventStreamError';
  }
}

export interface LifecycleFoldContext {
  currentState: CanonicalPackageLifecycleState;
  quarantineOrigin: QuarantineOriginState | null;
  lastSequenceNumber: number;
}

/**
 * Applies a single atomic event to the current lifecycle state according to the formal FSM.
 */
export function applyLifecycleTransition(
  currentState: CanonicalPackageLifecycleState,
  event: CanonicalPackageEvent,
  quarantineOrigin: QuarantineOriginState | null
): { nextState: CanonicalPackageLifecycleState; nextQuarantineOrigin: QuarantineOriginState | null } {
  const { eventType, eventPayload } = event;

  switch (currentState) {
    case 'DRAFT': {
      if (eventType === 'PERSISTENCE_COMMITTED') {
        return { nextState: 'PERSISTED', nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'Only PERSISTENCE_COMMITTED can transition a DRAFT package envelope.'
      );
    }

    case 'PERSISTED': {
      if (eventType === 'VALIDATION_RECORDED') {
        const status = eventPayload.validationStatus as string | undefined;
        if (status === 'PACKAGE_VALIDATED') {
          return { nextState: 'VALIDATED', nextQuarantineOrigin: null };
        } else {
          // Invariant failures or review required trigger validation-failure quarantine
          return { nextState: 'QUARANTINED', nextQuarantineOrigin: 'PERSISTED' };
        }
      }
      if (eventType === 'SUPERSESSION_REGISTERED') {
        return { nextState: 'SUPERSEDED', nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'PERSISTED packages can only transition via VALIDATION_RECORDED or SUPERSESSION_REGISTERED.'
      );
    }

    case 'VALIDATED': {
      if (eventType === 'PUBLICATION_ISSUED') {
        return { nextState: 'PUBLISHED', nextQuarantineOrigin: null };
      }
      if (eventType === 'QUARANTINE_APPLIED') {
        return { nextState: 'QUARANTINED', nextQuarantineOrigin: 'VALIDATED' };
      }
      if (eventType === 'SUPERSESSION_REGISTERED') {
        return { nextState: 'SUPERSEDED', nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'VALIDATED packages can only transition via PUBLICATION_ISSUED, QUARANTINE_APPLIED, or SUPERSESSION_REGISTERED.'
      );
    }

    case 'PUBLISHED': {
      if (eventType === 'QUARANTINE_APPLIED') {
        return { nextState: 'QUARANTINED', nextQuarantineOrigin: 'PUBLISHED' };
      }
      if (eventType === 'SUPERSESSION_REGISTERED') {
        return { nextState: 'SUPERSEDED', nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'PUBLISHED packages can only transition via QUARANTINE_APPLIED or SUPERSESSION_REGISTERED.'
      );
    }

    case 'QUARANTINED': {
      if (eventType === 'QUARANTINE_RELEASED') {
        // Option A Enforcement: Validation-failure quarantine is strictly irreversible
        if (quarantineOrigin === 'PERSISTED') {
          throw new InvalidLifecycleTransitionError(
            currentState,
            eventType,
            'Option A Violation: Validation-failure quarantine (origin=PERSISTED) is strictly irreversible and cannot be released. May only transition to SUPERSEDED.'
          );
        }
        if (quarantineOrigin === 'VALIDATED') {
          return { nextState: 'VALIDATED', nextQuarantineOrigin: null };
        }
        if (quarantineOrigin === 'PUBLISHED') {
          return { nextState: 'PUBLISHED', nextQuarantineOrigin: null };
        }
        throw new InvalidLifecycleTransitionError(
          currentState,
          eventType,
          'Cannot release quarantine without a valid recorded origin (VALIDATED or PUBLISHED).'
        );
      }
      if (eventType === 'SUPERSESSION_REGISTERED') {
        return { nextState: 'SUPERSEDED', nextQuarantineOrigin: null };
      }
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'QUARANTINED packages can only transition via QUARANTINE_RELEASED or SUPERSESSION_REGISTERED.'
      );
    }

    case 'SUPERSEDED': {
      throw new InvalidLifecycleTransitionError(
        currentState,
        eventType,
        'SUPERSEDED is strictly a terminal state. No subsequent transitions are permitted.'
      );
    }

    default: {
      const _exhaustiveCheck: never = currentState;
      throw new Error(`Unhandled lifecycle state: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Pure reducer function that evaluates an event stream from DRAFT to current derived state.
 * Throws CorruptedEventStreamError if sequence numbers have gaps/duplicates or transitions violate FSM.
 */
export function reducePackageLifecycle(
  events: readonly CanonicalPackageEvent[],
  packageId?: string
): CanonicalPackageLifecycleState {
  if (events.length === 0) {
    return 'DRAFT';
  }

  // Ensure evaluation in strict sequence order
  const sortedEvents = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  let state: CanonicalPackageLifecycleState = 'DRAFT';
  let quarantineOrigin: QuarantineOriginState | null = null;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CorruptedEventStreamError(packageId || event.packageId, msg);
    }

    expectedSeq++;
  }

  return state;
}
