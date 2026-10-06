/**
 * UADUE — Universal Assessment Document Understanding Engine
 * QuestionGraph Serializer & Sealing Engine (Phase 2C)
 *
 * Produces bitwise-deterministic canonical JSON representations and SHA-256 seals.
 */

import * as crypto from 'node:crypto';
import { QuestionGraph } from '../contracts/questionGraph';

export class QuestionGraphSerializer {
  /**
   * Recursively normalizes an object with alphabetically sorted keys and float precision.
   */
  public static canonicalize(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'number') {
      if (!Number.isFinite(obj)) return 'NaN';
      // Normalize to 4 decimal places to prevent float string jitter
      return Math.round(obj * 10000) / 10000;
    }

    if (typeof obj !== 'object') return obj;

    if (obj instanceof Map) {
      const sortedKeys = Array.from(obj.keys()).sort();
      const result: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        result[String(k)] = QuestionGraphSerializer.canonicalize(obj.get(k));
      }
      return result;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => QuestionGraphSerializer.canonicalize(item));
    }

    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      if (k === 'sealedHash' || k === 'sealedAt' || k === 'isSealed') {
        continue; // Exclude seal metadata from seal hash calculation
      }
      result[k] = QuestionGraphSerializer.canonicalize((obj as Record<string, unknown>)[k]);
    }
    return result;
  }

  /**
   * Serializes a QuestionGraph to a canonical UTF-8 JSON string.
   */
  public static serialize(graph: QuestionGraph): string {
    const canonicalObj = QuestionGraphSerializer.canonicalize(graph);
    return JSON.stringify(canonicalObj);
  }

  /**
   * Computes deterministic SHA-256 sealed hash and seals the QuestionGraph.
   */
  public static async sealGraph(graph: QuestionGraph): Promise<void> {
    const canonicalJson = QuestionGraphSerializer.serialize(graph);
    const hash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

    graph.isSealed = true;
    graph.sealedHash = hash;
    graph.sealedAt = graph.provenance.createdAt || Date.now();
  }
}
