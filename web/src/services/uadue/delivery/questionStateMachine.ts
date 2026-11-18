/**
 * UADUE Phase 3.4 — Candidate Question State Machine
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * FSM & Reducer Model: UADUE-P3-FSM-004
 *
 * Implements server-authoritative candidate question state transitions:
 * 1. Event reduction into candidate_question_states (Contract R3-01)
 * 2. Monotonic current_state_version increment per question
 * 3. Exact answer representation (SINGLE_CHOICE_SELECT, MULTIPLE_CHOICE_SELECT, NUMERICAL_VALUE_ENTRY, CLEAR_RESPONSE)
 * 4. Ingress sequence binding to last_server_sequence foreign key
 * 5. Deterministic replay reconstruction from candidate_submission_events stream
 * 6. Mathematical parity verification (persisted state vs recomputed stream)
 * 7. Candidate answered summary projection for navigation palette and scoring
 */

import { PoolClient } from 'pg';
import { createHash } from 'crypto';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import {
  CandidateQuestionStateRecord,
  CandidateSubmissionEventRecord,
  SessionQuestionSummary,
} from './deliveryTypes';

export class QuestionStateError extends Error {
  constructor(message: string) {
    super(`Question State Error: ${message}`);
    this.name = 'QuestionStateError';
  }
}

export interface QuestionStateReductionOutput {
  selectedOptionId: string | null;
  responsePayload: Record<string, unknown> | null;
  payloadFingerprint: string | null;
  isAnswered: boolean;
}

export class QuestionStateMachine {
  constructor(private readonly adapter: DeliveryPostgresAdapter) {}

  /**
   * Pure deterministic reduction of an event into a question state output
   */
  public reduceEvent(
    eventType: string,
    payload: Record<string, unknown>,
    currentState?: CandidateQuestionStateRecord | null
  ): QuestionStateReductionOutput {
    switch (eventType) {
      case 'SINGLE_CHOICE_SELECT': {
        const optionId = (payload.selectedOptionId as string) || null;
        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: optionId,
          responsePayload: payload,
          payloadFingerprint: fingerprint,
          isAnswered: Boolean(optionId),
        };
      }

      case 'MULTIPLE_CHOICE_SELECT': {
        const optionIds = (payload.selectedOptionIds as string[]) || [];
        const isAnswered = optionIds.length > 0;
        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: optionIds.length === 1 ? optionIds[0] : null,
          responsePayload: payload,
          payloadFingerprint: fingerprint,
          isAnswered,
        };
      }

      case 'NUMERICAL_VALUE_ENTRY': {
        const value = payload.enteredValue;
        const isAnswered = value !== null && value !== undefined && String(value).trim() !== '';
        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: null,
          responsePayload: payload,
          payloadFingerprint: fingerprint,
          isAnswered,
        };
      }

      case 'SUBJECTIVE_TEXT_ENTRY': {
        const text = payload.text;
        const isAnswered = text !== null && text !== undefined && String(text).trim() !== '';
        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: null,
          responsePayload: payload,
          payloadFingerprint: fingerprint,
          isAnswered,
        };
      }

      case 'CLEAR_RESPONSE': {
        return {
          selectedOptionId: null,
          responsePayload: null,
          payloadFingerprint: null,
          isAnswered: false,
        };
      }

      case 'QUESTION_RESPONSE_RECORDED': {
        const hasSelectedOptionId = payload.selectedOptionId !== undefined && payload.selectedOptionId !== null;
        const hasSelectedOptionIds = Array.isArray(payload.selectedOptionIds);
        const hasEnteredValue = payload.enteredValue !== undefined && payload.enteredValue !== null;

        if (hasSelectedOptionIds) {
          const optionIds = payload.selectedOptionIds as string[];
          const isAnswered = optionIds.length > 0;
          if (!isAnswered) {
            return {
              selectedOptionId: null,
              responsePayload: null,
              payloadFingerprint: null,
              isAnswered: false,
            };
          }
          const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
          const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
          return {
            selectedOptionId: optionIds.length === 1 ? optionIds[0] : null,
            responsePayload: payload,
            payloadFingerprint: fingerprint,
            isAnswered: true,
          };
        }

        if (hasEnteredValue) {
          const val = String(payload.enteredValue).trim();
          const isAnswered = val.length > 0;
          if (!isAnswered) {
            return {
              selectedOptionId: null,
              responsePayload: null,
              payloadFingerprint: null,
              isAnswered: false,
            };
          }
          const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
          const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
          return {
            selectedOptionId: null,
            responsePayload: payload,
            payloadFingerprint: fingerprint,
            isAnswered: true,
          };
        }

        if (hasSelectedOptionId) {
          const optionId = String(payload.selectedOptionId);
          const isAnswered = optionId.length > 0;
          if (!isAnswered) {
            return {
              selectedOptionId: null,
              responsePayload: null,
              payloadFingerprint: null,
              isAnswered: false,
            };
          }
          const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
          const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
          return {
            selectedOptionId: optionId,
            responsePayload: payload,
            payloadFingerprint: fingerprint,
            isAnswered: true,
          };
        }

        // Empty payload or clearing payload
        const hasData = Object.keys(payload).length > 0;
        if (!hasData) {
          return {
            selectedOptionId: null,
            responsePayload: null,
            payloadFingerprint: null,
            isAnswered: false,
          };
        }

        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: null,
          responsePayload: payload,
          payloadFingerprint: fingerprint,
          isAnswered: true,
        };
      }

      case 'MARK_FOR_REVIEW': {
        const existingPayload = currentState?.responsePayload || {};
        const updatedPayload = { ...existingPayload, isMarkedForReview: true };
        const canonicalStr = JSON.stringify(updatedPayload, Object.keys(updatedPayload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: currentState?.selectedOptionId ?? null,
          responsePayload: updatedPayload,
          payloadFingerprint: fingerprint,
          isAnswered: currentState?.isAnswered ?? false,
        };
      }

      case 'UNMARK_FOR_REVIEW': {
        const existingPayload = currentState?.responsePayload || {};
        const updatedPayload = { ...existingPayload, isMarkedForReview: false };
        const canonicalStr = JSON.stringify(updatedPayload, Object.keys(updatedPayload).sort());
        const fingerprint = createHash('sha256').update(canonicalStr).digest('hex');
        return {
          selectedOptionId: currentState?.selectedOptionId ?? null,
          responsePayload: updatedPayload,
          payloadFingerprint: fingerprint,
          isAnswered: currentState?.isAnswered ?? false,
        };
      }

      default: {
        // Unknown or custom interaction event: treat as answer payload if present
        const hasData = Object.keys(payload).length > 0;
        const canonicalStr = JSON.stringify(payload, Object.keys(payload).sort());
        const fingerprint = hasData
          ? createHash('sha256').update(canonicalStr).digest('hex')
          : null;
        return {
          selectedOptionId: (payload.selectedOptionId as string) || null,
          responsePayload: hasData ? payload : null,
          payloadFingerprint: fingerprint,
          isAnswered: hasData,
        };
      }
    }
  }

  /**
   * Apply a newly ingested candidate submission event to the PostgreSQL question state
   */
  public async applySubmissionEvent(
    event: CandidateSubmissionEventRecord
  ): Promise<CandidateQuestionStateRecord> {
    if (!event.serverSequenceNumber) {
      throw new QuestionStateError('Event must have an allocated serverSequenceNumber');
    }

    return this.adapter.withTransaction(event.tenantId, async (client) => {
      // 1. Fetch current question state with row lock
      const existingRes = await client.query(
        `SELECT * FROM public.candidate_question_states 
         WHERE exam_session_id = $1 AND canonical_question_id = $2 FOR UPDATE`,
        [event.examSessionId, event.canonicalQuestionId]
      );

      let currentState: CandidateQuestionStateRecord | null = null;
      if (existingRes.rows.length > 0) {
        const r = existingRes.rows[0];
        currentState = {
          stateId: r.state_id,
          examSessionId: r.exam_session_id,
          tenantId: r.tenant_id,
          canonicalQuestionId: r.canonical_question_id,
          currentStateVersion: r.current_state_version,
          selectedOptionId: r.selected_option_id,
          responsePayload: r.response_payload,
          payloadFingerprint: r.payload_fingerprint,
          lastServerSequence: Number(r.last_server_sequence),
          lastClientEventId: r.last_client_event_id,
          isAnswered: r.is_answered,
          updatedAt: r.updated_at.toISOString(),
        };
      }

      // 2. Reduce event into updated output
      const reduction = this.reduceEvent(
        event.eventType,
        event.candidateResponse,
        currentState
      );

      const nextVersion = (currentState?.currentStateVersion ?? 0) + 1;
      const stateId = currentState?.stateId || `qs_${event.examSessionId}_${event.canonicalQuestionId}`;
      const nowIso = new Date().toISOString();

      const newState: CandidateQuestionStateRecord = {
        stateId,
        examSessionId: event.examSessionId,
        tenantId: event.tenantId,
        canonicalQuestionId: event.canonicalQuestionId,
        currentStateVersion: nextVersion,
        selectedOptionId: reduction.selectedOptionId,
        responsePayload: reduction.responsePayload,
        payloadFingerprint: reduction.payloadFingerprint,
        lastServerSequence: event.serverSequenceNumber!,
        lastClientEventId: event.clientEventId,
        isAnswered: reduction.isAnswered,
        updatedAt: nowIso,
      };

      // 3. Upsert into candidate_question_states
      await client.query(
        `INSERT INTO public.candidate_question_states (
          state_id, exam_session_id, tenant_id, canonical_question_id,
          current_state_version, selected_option_id, response_payload, payload_fingerprint,
          last_server_sequence, last_client_event_id, is_answered, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (exam_session_id, canonical_question_id) DO UPDATE SET
          current_state_version = EXCLUDED.current_state_version,
          selected_option_id = EXCLUDED.selected_option_id,
          response_payload = EXCLUDED.response_payload,
          payload_fingerprint = EXCLUDED.payload_fingerprint,
          last_server_sequence = EXCLUDED.last_server_sequence,
          last_client_event_id = EXCLUDED.last_client_event_id,
          is_answered = EXCLUDED.is_answered,
          updated_at = EXCLUDED.updated_at`,
        [
          newState.stateId,
          newState.examSessionId,
          newState.tenantId,
          newState.canonicalQuestionId,
          newState.currentStateVersion,
          newState.selectedOptionId,
          newState.responsePayload ? JSON.stringify(newState.responsePayload) : null,
          newState.payloadFingerprint,
          newState.lastServerSequence,
          newState.lastClientEventId,
          newState.isAnswered,
          newState.updatedAt,
        ]
      );

      return newState;
    });
  }

  /**
   * Deterministically reconstruct all question states by replaying the session's event stream
   */
  public async reconstructStatesFromEventStream(
    sessionId: string,
    tenantId: string
  ): Promise<Map<string, CandidateQuestionStateRecord>> {
    const events = await this.adapter.getSubmissionEvents(sessionId, tenantId);
    const reducedMap = new Map<string, CandidateQuestionStateRecord>();

    for (const evt of events) {
      const current = reducedMap.get(evt.canonicalQuestionId) || null;
      const reduction = this.reduceEvent(evt.eventType, evt.candidateResponse, current);
      const nextVersion = (current?.currentStateVersion ?? 0) + 1;

      const state: CandidateQuestionStateRecord = {
        stateId: `reconstructed_${sessionId}_${evt.canonicalQuestionId}`,
        examSessionId: sessionId,
        tenantId,
        canonicalQuestionId: evt.canonicalQuestionId,
        currentStateVersion: nextVersion,
        selectedOptionId: reduction.selectedOptionId,
        responsePayload: reduction.responsePayload,
        payloadFingerprint: reduction.payloadFingerprint,
        lastServerSequence: evt.serverSequenceNumber!,
        lastClientEventId: evt.clientEventId,
        isAnswered: reduction.isAnswered,
        updatedAt: evt.serverTimestamp || new Date().toISOString(),
      };
      reducedMap.set(evt.canonicalQuestionId, state);
    }

    return reducedMap;
  }

  /**
   * Verify mathematical parity between persisted database state and stream recomputed state
   */
  public async verifyStateReplayParity(
    sessionId: string,
    tenantId: string
  ): Promise<{ parity: boolean; mismatches: string[] }> {
    const persistedList = await this.adapter.getAllQuestionStates(sessionId, tenantId);
    const reconstructedMap = await this.reconstructStatesFromEventStream(sessionId, tenantId);

    const mismatches: string[] = [];

    // Compare counts
    if (persistedList.length !== reconstructedMap.size) {
      mismatches.push(
        `Count mismatch: persisted has ${persistedList.length} rows, stream reduced has ${reconstructedMap.size} questions`
      );
    }

    for (const p of persistedList) {
      const r = reconstructedMap.get(p.canonicalQuestionId);
      if (!r) {
        mismatches.push(`Question ${p.canonicalQuestionId} missing from reconstructed stream`);
        continue;
      }

      if (p.currentStateVersion !== r.currentStateVersion) {
        mismatches.push(
          `Version mismatch on ${p.canonicalQuestionId}: persisted v${p.currentStateVersion} !== stream v${r.currentStateVersion}`
        );
      }
      if (p.selectedOptionId !== r.selectedOptionId) {
        mismatches.push(
          `Option mismatch on ${p.canonicalQuestionId}: persisted ${p.selectedOptionId} !== stream ${r.selectedOptionId}`
        );
      }
      if (p.isAnswered !== r.isAnswered) {
        mismatches.push(
          `Answered flag mismatch on ${p.canonicalQuestionId}: persisted ${p.isAnswered} !== stream ${r.isAnswered}`
        );
      }
      if (p.lastServerSequence !== r.lastServerSequence) {
        mismatches.push(
          `Sequence mismatch on ${p.canonicalQuestionId}: persisted seq ${p.lastServerSequence} !== stream seq ${r.lastServerSequence}`
        );
      }
      if (p.payloadFingerprint !== r.payloadFingerprint) {
        mismatches.push(
          `Fingerprint mismatch on ${p.canonicalQuestionId}: persisted ${p.payloadFingerprint} !== stream ${r.payloadFingerprint}`
        );
      }
    }

    return {
      parity: mismatches.length === 0,
      mismatches,
    };
  }

  /**
   * Get candidate answered question summary projection
   */
  public async getSessionQuestionSummary(
    sessionId: string,
    tenantId: string
  ): Promise<SessionQuestionSummary> {
    const states = await this.adapter.getAllQuestionStates(sessionId, tenantId);

    const answeredQuestionIds: string[] = [];
    const unansweredQuestionIds: string[] = [];

    for (const s of states) {
      if (s.isAnswered) {
        answeredQuestionIds.push(s.canonicalQuestionId);
      } else {
        unansweredQuestionIds.push(s.canonicalQuestionId);
      }
    }

    return {
      examSessionId: sessionId,
      totalQuestions: states.length,
      answeredCount: answeredQuestionIds.length,
      unansweredCount: unansweredQuestionIds.length,
      answeredQuestionIds,
      unansweredQuestionIds,
    };
  }
}
