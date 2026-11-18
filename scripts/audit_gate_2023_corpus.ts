import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { LatexRenderer } from '../web/src/components/LatexRenderer';

interface QuestionAuditResult {
  paperCode: string;
  paperFile: string;
  questionNumber: number;
  questionType: string;
  rawSyntaxDefects: string[];
  rawFontArtifacts: string[];
  renderingDefects: string[];
  sourceFidelityIssues: string[];
}

function auditCorpus() {
  console.log('================================================================');
  console.log('MOCK.AI — COMPREHENSIVE GATE 2023 CORPUS AUDIT');
  console.log('Scanning all 31 exam papers (2,217 total questions)');
  console.log('================================================================\n');

  const papersDir = path.resolve(__dirname, '../web/src/data/exams');
  const paperFiles = fs
    .readdirSync(papersDir)
    .filter(f => f.startsWith('gate-2023-') && f.endsWith('.json'))
    .sort();

  console.log(`Found ${paperFiles.length} GATE 2023 papers in ${papersDir}\n`);

  let totalQuestions = 0;
  let rawCleanQuestions = 0;
  let candidateRenderableQuestions = 0;
  let sourceFidelityCleanQuestions = 0;

  const rawSyntaxDefectsList: QuestionAuditResult[] = [];
  const rawFontArtifactsList: QuestionAuditResult[] = [];
  const renderingDefectsList: QuestionAuditResult[] = [];
  const sourceFidelityIssuesList: QuestionAuditResult[] = [];

  const ctrlCharRegex = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
  const puaRegex = /[\ue000-\uf8ff]/g;
  const combiningRegex = /[\u0300-\u036f\u20d0-\u20ff]/g;
  const footerRegex = /Page \d+ of \d+/g;
  const headerRegex = /Organizing Institute:/g;
  const malformedDelimRegex = /\\+\}\)/g;
  const tokenRegex = /KATEX_TOKEN/g;

  // Track font artifact occurrences
  const fontArtifactSummary: Record<string, number> = {};

  for (const file of paperFiles) {
    const fullPath = path.join(papersDir, file);
    const paperData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const paperCode = paperData.paperCode || file.replace('gate-2023-', '').replace('.json', '').toUpperCase();
    const questions = paperData.questions || [];

    for (const q of questions) {
      totalQuestions++;
      const qNum = q.question_number || q.questionNumber;
      const qType = q.question_type || q.questionType;
      const stem = q.questionText || q.stem || '';
      const options = q.options || [];
      const combinedText = stem + ' ' + options.join(' ');

      const rawSyntaxDefects: string[] = [];
      const rawFontArtifacts: string[] = [];
      const renderingDefects: string[] = [];
      const sourceFidelityIssues: string[] = [];

      // ── 1. RAW CONTENT AUDIT ──────────────────────────────────────────
      // Residual Syntax Defects (Corruptions that affect mathematical grammar or integrity)
      const ctrlMatches = combinedText.match(ctrlCharRegex);
      if (ctrlMatches) {
        rawSyntaxDefects.push(`Non-printing control characters (${ctrlMatches.length})`);
      }

      const footerMatches = combinedText.match(footerRegex);
      if (footerMatches) {
        rawSyntaxDefects.push(`Footer leak: ${footerMatches.join(', ')}`);
      }

      const headerMatches = combinedText.match(headerRegex);
      if (headerMatches) {
        rawSyntaxDefects.push(`Header leak: ${headerMatches.join(', ')}`);
      }

      if (combinedText.includes('\\})')) {
        rawSyntaxDefects.push('Malformed closing delimiter \\})');
      }

      if (combinedText.includes('( ( (') || combinedText.includes(') ) )')) {
        rawSyntaxDefects.push('Repeated parenthesis artifact');
      }

      // Check for spurious natural language prose in subscripts
      const spuriousSubscriptMatch = combinedText.match(/_\{([a-zA-Z\s]{12,})\}/);
      if (spuriousSubscriptMatch && !spuriousSubscriptMatch[1].includes('\\text')) {
        rawSyntaxDefects.push(`Spurious subscript prose: "${spuriousSubscriptMatch[1].slice(0, 30)}..."`);
      }

      // Normalizable Font Artifacts (Pre-Unicode/Symbol font glyphs handled by normalizers)
      const puaMatches = combinedText.match(puaRegex);
      if (puaMatches) {
        const uniquePua = Array.from(new Set(puaMatches)).map(c => `0x${c.charCodeAt(0).toString(16)}`);
        rawFontArtifacts.push(`PUA characters (${puaMatches.length}: ${uniquePua.join(', ')})`);
        for (const code of uniquePua) {
          fontArtifactSummary[code] = (fontArtifactSummary[code] || 0) + 1;
        }
      }

      const combiningMatches = combinedText.match(combiningRegex);
      if (combiningMatches) {
        const uniqueComb = Array.from(new Set(combiningMatches)).map(c => `0x${c.charCodeAt(0).toString(16)}`);
        rawFontArtifacts.push(`Combining accents (${combiningMatches.length}: ${uniqueComb.join(', ')})`);
        for (const code of uniqueComb) {
          fontArtifactSummary[code] = (fontArtifactSummary[code] || 0) + 1;
        }
      }

      // ── 2. CANDIDATE RENDERING AUDIT ──────────────────────────────────
      // Render stem
      try {
        const stemHtml = ReactDOMServer.renderToString(React.createElement(LatexRenderer, { content: stem }));
        if (stemHtml.includes('katex-error')) {
          renderingDefects.push('KaTeX error in question stem');
        }
        if (stemHtml.includes('___KATEX_TOKEN_')) {
          renderingDefects.push('Token leak in question stem');
        }
      } catch (err: any) {
        renderingDefects.push(`Stem render crash: ${err.message}`);
      }

      // Render options
      for (let oIdx = 0; oIdx < options.length; oIdx++) {
        try {
          const optHtml = ReactDOMServer.renderToString(React.createElement(LatexRenderer, { content: options[oIdx] }));
          if (optHtml.includes('katex-error')) {
            renderingDefects.push(`KaTeX error in option ${oIdx + 1}`);
          }
          if (optHtml.includes('___KATEX_TOKEN_')) {
            renderingDefects.push(`Token leak in option ${oIdx + 1}`);
          }
        } catch (err: any) {
          renderingDefects.push(`Option ${oIdx + 1} render crash: ${err.message}`);
        }
      }

      // ── 3. SOURCE FIDELITY & ASSESSMENT INTEGRITY AUDIT ───────────────
      // Missing stem
      if (!stem || stem.trim().length === 0) {
        sourceFidelityIssues.push('Empty question stem');
      }

      // Option counts
      if ((qType === 'MCQ' || qType === 'MSQ') && options.length !== 4) {
        // Some specialized papers might have non-4 options, flag for inspection
        sourceFidelityIssues.push(`Unexpected option count for ${qType}: ${options.length} (expected 4)`);
      }

      if (qType === 'NAT' && options.length > 0) {
        sourceFidelityIssues.push(`NAT question has extraneous options: ${options.length}`);
      }

      // Answer key presence
      const ans = q.correct_answer || q.correctAnswer;
      if (!ans || String(ans).trim().length === 0) {
        sourceFidelityIssues.push('Missing correct answer key');
      }

      // Diagram asset existence
      const diagUrls = q.diagram_urls || (q.diagram_url ? [q.diagram_url] : []);
      for (const dUrl of diagUrls) {
        if (dUrl && typeof dUrl === 'string' && dUrl.startsWith('/exam-assets/')) {
          const assetPath = path.join(__dirname, '../web/public', dUrl);
          if (!fs.existsSync(assetPath)) {
            sourceFidelityIssues.push(`Missing diagram asset file on disk: ${dUrl}`);
          }
        }
      }

      // Tally results
      const hasRawDefect = rawSyntaxDefects.length > 0 || rawFontArtifacts.length > 0;
      if (!hasRawDefect) {
        rawCleanQuestions++;
      }

      const isCandidateRenderable = renderingDefects.length === 0;
      if (isCandidateRenderable) {
        candidateRenderableQuestions++;
      }

      const isSourceFidelityClean = sourceFidelityIssues.length === 0 && rawSyntaxDefects.length === 0;
      if (isSourceFidelityClean) {
        sourceFidelityCleanQuestions++;
      }

      const result: QuestionAuditResult = {
        paperCode,
        paperFile: file,
        questionNumber: qNum,
        questionType: qType,
        rawSyntaxDefects,
        rawFontArtifacts,
        renderingDefects,
        sourceFidelityIssues,
      };

      if (rawSyntaxDefects.length > 0) rawSyntaxDefectsList.push(result);
      if (rawFontArtifacts.length > 0) rawFontArtifactsList.push(result);
      if (renderingDefects.length > 0) renderingDefectsList.push(result);
      if (sourceFidelityIssues.length > 0) sourceFidelityIssuesList.push(result);
    }
  }

  // ── AUDIT SUMMARY REPORT ───────────────────────────────────────────
  console.log('================================================================');
  console.log('CORPUS AUDIT METRICS');
  console.log('================================================================');
  console.log(`Total GATE 2023 Papers:               ${paperFiles.length}`);
  console.log(`Total Questions Scanned:               ${totalQuestions}`);
  console.log(
    `Raw JSON Fully Clean (0 flags):       ${rawCleanQuestions} / ${totalQuestions} (${((rawCleanQuestions / totalQuestions) * 100).toFixed(2)}%)`
  );
  console.log(
    `Candidate-Renderable (0 KaTeX errs):  ${candidateRenderableQuestions} / ${totalQuestions} (${((candidateRenderableQuestions / totalQuestions) * 100).toFixed(2)}%)`
  );
  console.log(
    `Source Fidelity Clean:                ${sourceFidelityCleanQuestions} / ${totalQuestions} (${((sourceFidelityCleanQuestions / totalQuestions) * 100).toFixed(2)}%)`
  );
  console.log('----------------------------------------------------------------\n');

  console.log('================================================================');
  console.log(`1. RESIDUAL RAW SYNTAX DEFECTS (${rawSyntaxDefectsList.length} questions)`);
  console.log('================================================================');
  if (rawSyntaxDefectsList.length === 0) {
    console.log('✓ ZERO residual raw syntax defects found across all 2,217 questions!');
  } else {
    for (const item of rawSyntaxDefectsList) {
      console.log(`• ${item.paperCode} Q${item.questionNumber} (${item.paperFile}):`);
      for (const d of item.rawSyntaxDefects) {
        console.log(`    - ${d}`);
      }
    }
  }
  console.log('');

  console.log('================================================================');
  console.log(`2. CANDIDATE RENDERING DEFECTS (${renderingDefectsList.length} questions)`);
  console.log('================================================================');
  if (renderingDefectsList.length === 0) {
    console.log('✓ ZERO candidate rendering defects! 100% of questions parse cleanly in LatexRenderer.');
  } else {
    for (const item of renderingDefectsList) {
      console.log(`• ${item.paperCode} Q${item.questionNumber} (${item.paperFile}):`);
      for (const d of item.renderingDefects) {
        console.log(`    - ${d}`);
      }
    }
  }
  console.log('');

  console.log('================================================================');
  console.log(`3. RAW FONT ARTIFACTS / PRE-UNICODE GLYPHS (${rawFontArtifactsList.length} questions)`);
  console.log('================================================================');
  console.log('Glyph occurrences in corpus:');
  for (const [glyph, count] of Object.entries(fontArtifactSummary).sort((a, b) => b[1] - a[1])) {
    let desc = 'Unknown';
    if (glyph === '0x336') desc = 'Combining long stroke overlay (strikethrough in verbal Q9)';
    else if (glyph === '0x305') desc = 'Combining overline (bar/complement notation)';
    else if (glyph === '0x302') desc = 'Combining circumflex (unit vector hat)';
    else if (glyph === '0x20d7') desc = 'Combining right arrow above (vector notation)';
    else if (glyph === '0xf0b0') desc = 'Symbol font degree symbol (°)';
    else if (glyph === '0xf0b4') desc = 'Symbol font multiplication / prime (× / ′)';
    else if (glyph === '0xf0a2') desc = 'Symbol font prime mark (′)';
    else if (glyph === '0xf0c2') desc = 'Symbol font real numbers set (ℝ)';
    else if (glyph === '0xf0c5') desc = 'Symbol font oplus (⊕)';
    else if (glyph === '0xf0d0') desc = 'Symbol font angle (∠)';
    else if (['0xf0e6', '0xf0e7', '0xf0e8', '0xf0f6', '0xf0f7', '0xf0f8', '0xf0e9', '0xf0eb', '0xf0f9', '0xf0fb'].includes(glyph))
      desc = 'MathType large delimiter pieces';
    console.log(`  ${glyph}: ${count} questions (${desc})`);
  }
  console.log('');

  console.log('================================================================');
  console.log(`4. UNRESOLVED SOURCE FIDELITY ISSUES (${sourceFidelityIssuesList.length} questions)`);
  console.log('================================================================');
  if (sourceFidelityIssuesList.length === 0) {
    console.log('✓ ZERO unresolved source-fidelity issues!');
  } else {
    for (const item of sourceFidelityIssuesList) {
      console.log(`• ${item.paperCode} Q${item.questionNumber} (${item.paperFile}):`);
      for (const d of item.sourceFidelityIssues) {
        console.log(`    - ${d}`);
      }
    }
  }
  console.log('');
  console.log('================================================================');
  console.log('AUDIT COMPLETED');
  console.log('================================================================');
}

auditCorpus();
