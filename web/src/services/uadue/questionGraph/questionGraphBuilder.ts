/**
 * UADUE — Universal Assessment Document Understanding Engine
 * QuestionGraph Master Builder (Phase 2C)
 *
 * Master Pipeline Coordinator:
 * DocumentGraph
 *     ↓
 * Candidate Question Boundaries & Token Classification
 *     ↓
 * Option Classification & Explicit Ownership Hypotheses
 *     ↓
 * Stimulus, Table, Diagram, and Math Detection
 *     ↓
 * Cross-Page Continuation Evaluation
 *     ↓
 * Segmentation Hypotheses & Ambiguity Tracking
 *     ↓
 * QuestionGraph Assembly & Sealing
 *     ↓
 * Verification State
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  QuestionGraph,
  QuestionCandidate,
  OptionCandidate,
  StimulusCandidate,
  TableCandidate,
  DiagramCandidate,
  MathCandidate,
  AmbiguityRecord,
  QuestionGraphVerificationState,
  QuestionGraphProvenanceRecord,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';
import { TokenClassifier, TokenClassificationResult } from './tokenClassifier';
import { BoundaryDetector, CandidateQuestionBoundary } from './boundaryDetector';
import { OptionClassifier, QuestionAnchor } from './optionClassifier';
import { ContextualTokenReconstructor } from './contextualTokenReconstructor';
import { StimulusDetector } from './stimulusDetector';
import { TableDetector } from './tableDetector';
import { DiagramDetector } from './diagramDetector';
import { MathDetector } from './mathDetector';
import { CrossPageEvaluator, CrossPageEvaluationResult } from './crossPageEvaluator';
import { HypothesisEngine } from './hypothesisEngine';
import { QuestionGraphSerializer } from './questionGraphSerializer';
import { QuestionGraphValidator } from './questionGraphValidator';

export interface QuestionGraphBuilderConfig {
  schemaVersion: string;
  algorithmVersion: string;
  configurationVersion: string;
}

export const DEFAULT_QUESTION_GRAPH_CONFIG: QuestionGraphBuilderConfig = {
  schemaVersion: 'uadue_question_graph_v2c_schema',
  algorithmVersion: 'uadue_question_graph_builder_v2c_2026',
  configurationVersion: 'default_v2c_config_2026',
};

export class QuestionGraphBuilder {
  private config: QuestionGraphBuilderConfig;

  constructor(config?: Partial<QuestionGraphBuilderConfig>) {
    this.config = {
      schemaVersion: config?.schemaVersion ?? DEFAULT_QUESTION_GRAPH_CONFIG.schemaVersion,
      algorithmVersion: config?.algorithmVersion ?? DEFAULT_QUESTION_GRAPH_CONFIG.algorithmVersion,
      configurationVersion: config?.configurationVersion ?? DEFAULT_QUESTION_GRAPH_CONFIG.configurationVersion,
    };
  }

  /**
   * Builds an immutable, sealed QuestionGraph from a certified DocumentGraph.
   */
  public async buildGraph(documentGraph: DocumentGraph): Promise<QuestionGraph> {
    const ambiguities: AmbiguityRecord[] = [];

    // 0. Contextual Token Reconstruction (Phase 2C Remediation)
    const context = ContextualTokenReconstructor.analyze(documentGraph);

    // 1. Classify number-like tokens across all physical nodes
    const tokenResults = new Map<string, TokenClassificationResult>();
    let previousQuestionNumber: number | undefined;
    let previousQuestionHasExplicitPrefix: boolean = false;

    // Use reading flow order
    const orderedNodes = (
      documentGraph.readingFlow.length > 0
        ? documentGraph.readingFlow
        : Array.from(documentGraph.nodes.keys())
    )
      .map((id) => documentGraph.nodes.get(id))
      .filter((n): n is DocumentGraphNode => n !== undefined);

    for (const node of orderedNodes) {
      if (node.nodeType === 'TEXT_RUN' || node.nodeType === 'GLYPH_RUN') {
        const pageHeight = node.bbox.pageHeight || 842;
        const pageWidth = node.bbox.pageWidth || 595;
        const res = TokenClassifier.classifyToken(
          node,
          pageHeight,
          pageWidth,
          previousQuestionNumber,
          previousQuestionHasExplicitPrefix,
          context
        );
        tokenResults.set(node.nodeId, res);

        if (res.tokenType === 'QUESTION_NUMBER' && res.detectedNumber !== undefined) {
          previousQuestionNumber = res.detectedNumber;
          previousQuestionHasExplicitPrefix = /^(?:q(?:uestion)?|qn|que)\.?/i.test(res.rawLabel);
        }
      }
    }

    // 2. Detect candidate question boundaries
    const candidateBoundaries = BoundaryDetector.detectBoundaries(documentGraph, tokenResults);

    // 3. Build Question Anchors for option ownership evaluation
    const questionAnchors: QuestionAnchor[] = candidateBoundaries.map((b) => {
      const startNode = documentGraph.nodes.get(b.startNodeId);
      let stemBottomY = startNode?.bbox.y1 || 100;
      for (const sId of b.stemNodeIds) {
        const sn = documentGraph.nodes.get(sId);
        if (sn) stemBottomY = Math.max(stemBottomY, sn.bbox.y1);
      }
      return {
        candidateId: b.boundaryId,
        numberNodeId: b.numberNodeId,
        stemTopY: startNode?.bbox.y0 || 0,
        stemBottomY,
        pageNumber: b.startPageNumber,
        columnIndex: 0,
      };
    });

    // 4. Classify options and explicit multi-candidate ownership hypotheses
    const optionCandidates = OptionClassifier.classifyOptions(documentGraph, questionAnchors, tokenResults, context);

    // Track option ownership ambiguities
    for (const opt of optionCandidates) {
      if (opt.candidateOwners.length > 1) {
        const topDelta = opt.candidateOwners[0].confidence - opt.candidateOwners[1].confidence;
        if (topDelta < 0.20) {
          ambiguities.push({
            ambiguityId: `ambig_opt_owner_${opt.optionCandidateId}`,
            ambiguityType: 'OPTION_OWNERSHIP_UNCERTAINTY',
            affectedPhysicalNodeIds: opt.contentNodeIds,
            candidateHypothesisIds: opt.candidateOwners.map((o) => o.questionCandidateId),
            description: `Ambiguous owner for option ${opt.markerLabel}: top candidates differ by only ${(topDelta * 100).toFixed(1)}% confidence`,
            confidenceDelta: topDelta,
            reviewRecommended: true,
          });
        }
      }
    }

    // 5. Detect shared stimuli (passages, caselets, shared diagrams, shared tables)
    const stimuli = StimulusDetector.detectStimuli(documentGraph);

    // 6. Detect structured tables (preserving rows, columns, and matching matrices)
    const tables = TableDetector.detectTables(documentGraph);

    // 7. Detect diagrams (clustering raster/vector elements and spatial labels)
    const diagrams = DiagramDetector.detectDiagrams(documentGraph);

    // 8. Detect mathematics (grouping symbols and fractions without silent LaTeX conversion)
    const mathBlocks = MathDetector.detectMath(documentGraph);

    // 9. Evaluate cross-page physical continuations
    const crossPageResults = CrossPageEvaluator.evaluateContinuations(documentGraph);
    for (const cRes of crossPageResults) {
      if (cRes.ambiguity) {
        ambiguities.push(cRes.ambiguity);
      }
    }

    // 10. Assemble QuestionCandidate entities
    const questions: QuestionCandidate[] = [];

    for (const boundary of candidateBoundaries) {
      const qId = boundary.boundaryId;

      // Assign options whose primary candidate owner is this question
      const ownedOptions = optionCandidates.filter(
        (opt) => opt.resolvedOwnerQuestionId === qId || (opt.candidateOwners.length > 0 && opt.candidateOwners[0].questionCandidateId === qId)
      );

      // Find referenced shared stimuli
      const matchedStimuli = stimuli.filter((stim) => {
        // Check if stimulus was declared for this question number or immediately precedes it
        const qNum = boundary.identityCandidate.detectedNumber;
        if (qNum !== undefined) {
          return stim.supportedQuestionCandidateIds.includes(qId);
        }
        return false;
      });

      // Link question to preceding stimulus if on same page and before this question
      const precedingStimuli = stimuli.filter((stim) => {
        const stimFirstNode = documentGraph.nodes.get(stim.physicalNodeIds[0]);
        const qStartNode = documentGraph.nodes.get(boundary.startNodeId);
        if (stimFirstNode && qStartNode && stimFirstNode.pageNumber === qStartNode.pageNumber) {
          return stimFirstNode.bbox.y1 <= qStartNode.bbox.y0 + 10.0;
        }
        return false;
      });

      const allLinkedStimuli = Array.from(new Set([...matchedStimuli, ...precedingStimuli]));
      for (const stim of allLinkedStimuli) {
        if (!stim.supportedQuestionCandidateIds.includes(qId)) {
          stim.supportedQuestionCandidateIds.push(qId);
        }
      }

      // Associate spatial tables occurring within this question's vertical bounds
      const qStartNode = documentGraph.nodes.get(boundary.startNodeId);
      const qEndNode = documentGraph.nodes.get(boundary.endNodeId);
      const qTopY = qStartNode?.bbox.y0 || 0;
      const qBottomY = qEndNode?.bbox.y1 || 1000;
      const qPage = boundary.startPageNumber;

      // P0 — Hard Page Isolation Invariant: Assert source.pageNumber === target.pageNumber
      // Coordinates alone are NEVER sufficient for semantic ownership.
      const associatedTables = tables.filter((tbl) => {
        const tblPage = documentGraph.nodes.get(tbl.physicalNodeIds[0])?.pageNumber;
        if (tblPage !== qPage) {
          if (!boundary.isMultiPage || !tblPage || tblPage < boundary.startPageNumber || tblPage > boundary.endPageNumber) {
            return false;
          }
        }
        return tbl.gridGeometry.y0 >= qTopY - 10.0 && tbl.gridGeometry.y0 <= qBottomY + 50.0;
      });

      // Associate spatial diagrams occurring within this question's vertical bounds ON THE SAME PAGE
      const associatedDiagrams = diagrams.filter((diag) => {
        const diagPage = documentGraph.nodes.get(diag.physicalNodeIds[0])?.pageNumber;
        if (diagPage !== qPage) {
          if (!boundary.isMultiPage || !diagPage || diagPage < boundary.startPageNumber || diagPage > boundary.endPageNumber) {
            return false;
          }
        }
        return diag.visualBbox.y0 >= qTopY - 5.0 && diag.visualBbox.y1 <= qBottomY + 50.0;
      });

      // Associate math blocks occurring within this question ON THE SAME PAGE
      const associatedMath = mathBlocks.filter((math) => {
        const mathPage = documentGraph.nodes.get(math.physicalNodeIds[0])?.pageNumber;
        if (mathPage !== qPage) {
          if (!boundary.isMultiPage || !mathPage || mathPage < boundary.startPageNumber || mathPage > boundary.endPageNumber) {
            return false;
          }
        }
        return math.bbox.y0 >= qTopY - 5.0 && math.bbox.y1 <= qBottomY + 50.0;
      });

      // Gather all physical nodes belonging to this question
      const allQuestionPhysicalNodes = new Set<string>([
        ...boundary.includedNodeIds,
        ...ownedOptions.flatMap((o) => o.contentNodeIds),
        ...associatedTables.flatMap((t) => t.physicalNodeIds),
        ...associatedDiagrams.flatMap((d) => d.physicalNodeIds),
        ...associatedMath.flatMap((m) => m.physicalNodeIds),
      ]);

      const questionCandidate: QuestionCandidate = {
        candidateId: qId,
        physicalInstanceId: boundary.identityCandidate.physicalInstanceId,
        sourceQuestionNumber: boundary.identityCandidate.sourcePrintedLabel,
        officialQuestionId: boundary.officialQuestionId || boundary.identityCandidate.officialQuestionId,
        identityCandidate: boundary.identityCandidate,
        candidateDisplayOrder: questions.length + 1,
        sourceOrder: questions.length + 1,
        startPageNumber: boundary.startPageNumber,
        endPageNumber: boundary.endPageNumber,
        isMultiPage: boundary.startPageNumber !== boundary.endPageNumber,
        includedPhysicalNodeIds: Array.from(allQuestionPhysicalNodes),
        numberNodeId: boundary.numberNodeId,
        stemNodeIds: boundary.stemNodeIds,
        bodyNodeIds: boundary.bodyNodeIds,
        optionCandidateIds: ownedOptions.map((o) => o.optionCandidateId),
        stimulusRefIds: allLinkedStimuli.map((s) => s.stimulusId), // Shared references, zero cloning!
        tableCandidateIds: associatedTables.map((t) => t.tableCandidateId),
        diagramCandidateIds: associatedDiagrams.map((d) => d.diagramCandidateId),
        mathCandidateIds: associatedMath.map((m) => m.mathCandidateId),
        codeCandidateIds: [],
        observationState: boundary.observationState,
        verificationStatus: boundary.verificationStatus,
        confidenceScore: boundary.confidence,
        evidenceList: boundary.evidenceList,
        unresolvedAmbiguityIds: ambiguities
          .filter((a) => a.affectedPhysicalNodeIds.some((id) => allQuestionPhysicalNodes.has(id)))
          .map((a) => a.ambiguityId),
      };

      questions.push(questionCandidate);
    }

    // 11. Generate competing segmentation hypotheses
    const hypotheses = HypothesisEngine.generateHypotheses(
      documentGraph,
      candidateBoundaries,
      optionCandidates,
      stimuli,
      ambiguities,
      this.config.algorithmVersion,
      this.config.configurationVersion
    );

    const activeHypothesisId = hypotheses.length > 0 ? hypotheses[0].hypothesisId : 'hyp_none';

    // 12. Compute QuestionGraph Verification State
    let unverifiedCount = 0;
    let supportedCount = 0;
    let conflictedCount = 0;
    let ambiguousCount = 0;
    let verifiedCount = 0;
    let rejectedCount = 0;

    for (const q of questions) {
      if (q.verificationStatus === 'UNVERIFIED') unverifiedCount++;
      else if (q.verificationStatus === 'SUPPORTED') supportedCount++;
      else if (q.verificationStatus === 'CONFLICTED') conflictedCount++;
      else if (q.verificationStatus === 'AMBIGUOUS') ambiguousCount++;
      else if (q.verificationStatus === 'VERIFIED') verifiedCount++;
      else if (q.verificationStatus === 'REJECTED') rejectedCount++;
    }

    const verificationState: QuestionGraphVerificationState = {
      overallStatus: ambiguousCount > 0 ? 'AMBIGUOUS' : supportedCount > 0 ? 'SUPPORTED' : 'UNVERIFIED',
      unverifiedCount,
      supportedCount,
      conflictedCount,
      ambiguousCount,
      verifiedCount,
      rejectedCount,
      findings: ambiguities.map((amb) => ({
        findingId: `find_${amb.ambiguityId}`,
        severity: 'REVIEW_REQUIRED',
        ruleId: 'AMBIGUITY_RESOLVER',
        message: amb.description,
        affectedCandidateIds: amb.candidateHypothesisIds,
      })),
    };

    // 13. Assemble Provenance Record
    const buildTimestamp = documentGraph.sealedAt || 1700000000000;
    const provenance: QuestionGraphProvenanceRecord = {
      algorithmId: this.config.algorithmVersion,
      algorithmVersion: '1.0.0',
      configurationVersion: this.config.configurationVersion,
      sourceDocumentGraphId: documentGraph.graphId,
      sourceDocumentGraphSha256: documentGraph.sealedHash,
      sourceSnapshotId: documentGraph.sourceSnapshotId,
      sourceDocumentId: documentGraph.sourceDocumentId,
      sourceSha256: documentGraph.sourceSha256,
      createdAt: buildTimestamp,
      determinismScope: {
        identicalDocumentGraph: true,
        identicalAlgorithm: true,
        identicalConfig: true,
        runtime: `Node.js ${process.version} / V8`,
        floatPrecision: 'IEEE_754_64BIT',
      },
    };

    const graphId = `qgraph_${documentGraph.sourceDocumentId}_${documentGraph.sealedHash.slice(0, 16)}`;

    const questionGraph: QuestionGraph = {
      graphId,
      sourceDocumentId: documentGraph.sourceDocumentId,
      sourceSnapshotId: documentGraph.sourceSnapshotId,
      sourceSha256: documentGraph.sourceSha256,
      sourceDocumentGraphId: documentGraph.graphId,
      sourceDocumentGraphSha256: documentGraph.sealedHash,
      schemaVersion: this.config.schemaVersion,
      algorithmVersion: this.config.algorithmVersion,
      configurationVersion: this.config.configurationVersion,
      questions,
      stimuli,
      options: optionCandidates,
      tables,
      diagrams,
      mathBlocks,
      hypotheses,
      activeHypothesisId,
      ambiguities,
      verificationState,
      provenance,
      isSealed: false,
      sealedHash: '',
      sealedAt: 0,
    };

    // 14. Seal the QuestionGraph deterministically
    await QuestionGraphSerializer.sealGraph(questionGraph);

    // 15. Validate Phase 2C Invariants
    const validationResult = QuestionGraphValidator.validate(questionGraph, documentGraph);
    if (!validationResult.isValid) {
      throw new Error(`QuestionGraphInvariantViolation: ${validationResult.errors.join('; ')}`);
    }

    return questionGraph;
  }
}
