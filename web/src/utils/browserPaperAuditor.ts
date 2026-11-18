import { EXAM_PAPERS_MAP } from '../data/exams/catalog';
import katex from 'katex';

export interface AuditIssue {
  paperId: string;
  examId: string;
  editionYear: number;
  questionNumber: number;
  type: 'EMPTY_STEM' | 'EMPTY_OPTION' | 'MISSING_IMAGE_404' | 'WRONG_OPTION_COUNT' | 'KATEX_ERROR';
  details: string;
  assetUrl?: string;
  optionIndex?: number;
}

export interface AuditReport {
  timestamp: string;
  totalPapers: number;
  cleanPapers: number;
  papersWithIssues: number;
  totalIssues: number;
  issues: AuditIssue[];
  issuesByType: Record<string, number>;
  issuesByExamYear: Record<string, number>;
  problemPapers: {
    paperId: string;
    examId: string;
    editionYear: number;
    issueCount: number;
    issues: AuditIssue[];
  }[];
}

async function verifyImageExists(url: string, timeoutMs: number = 3000): Promise<boolean> {
  // Try fetch HEAD first
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    if (res.status === 404) return false;
  } catch {
    // Fall back to Image DOM probe
  }

  return new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

export async function auditAllPapers(options: { checkImages?: boolean; concurrency?: number } = {}): Promise<AuditReport> {
  const { checkImages = true, concurrency = 25 } = options;
  const papers = Object.values(EXAM_PAPERS_MAP);
  const issues: AuditIssue[] = [];

  // Step 1: Collect structural issues and asset URLs
  const assetUrlsToTest = new Set<string>();
  const assetToQuestionsMap = new Map<string, { paperId: string; examId: string; year: number; qNum: number; optIdx?: number }[]>();

  for (const paper of papers) {
    const examId = paper.examId;
    const year = paper.editionYear;
    const questions = paper.questions || [];

    for (const q of questions) {
      const qNum = q.questionNumber;
      const qText = (q.questionText || '').trim();
      const qDiag = (q as any).questionDiagram || (q as any).diagramUrl;
      const cBlocks = q.contentBlocks || [];
      const options = q.options || [];
      const richOpts = q.richOptions || [];
      const optImages = q.optionImages || [];
      const qType = q.questionType || 'MCQ';

      // Stem check
      const hasStem = Boolean(qText || qDiag || (cBlocks && cBlocks.length > 0));
      if (!hasStem) {
        issues.push({
          paperId: paper.id,
          examId,
          editionYear: year,
          questionNumber: qNum,
          type: 'EMPTY_STEM',
          details: 'Question has no stem text, diagram, or content blocks',
        });
      }

      // Track stem image
      if (qDiag && typeof qDiag === 'string' && qDiag.startsWith('/')) {
        assetUrlsToTest.add(qDiag);
        const list = assetToQuestionsMap.get(qDiag) || [];
        list.push({ paperId: paper.id, examId, year, qNum });
        assetToQuestionsMap.set(qDiag, list);
      }

      // Track content block images
      for (const block of cBlocks) {
        if (block && typeof block === 'object' && block.type === 'image') {
          const bUrl = (block as any).assetUrl || (block as any).url;
          if (bUrl && typeof bUrl === 'string' && bUrl.startsWith('/')) {
            assetUrlsToTest.add(bUrl);
            const list = assetToQuestionsMap.get(bUrl) || [];
            list.push({ paperId: paper.id, examId, year, qNum });
            assetToQuestionsMap.set(bUrl, list);
          }
        }
      }

      // Check KaTeX in stem
      if (qText) {
        const mathMatches = qText.matchAll(/\$\$([\s\S]+?)\$\$|\$(?!\s)([^\$\n]+?)(?<!\s)\$/g);
        for (const m of mathMatches) {
          const latex = m[1] || m[2];
          if (latex) {
            if (
              !latex.includes('\\') &&
              /\b(?:means|father|mother|brother|sister|son|daughter|husband|wife)\b/i.test(latex) &&
              latex.split(/\s+/).length >= 3
            ) {
              continue;
            }
            try {
              katex.renderToString(latex.trim(), { throwOnError: true });
            } catch (err: any) {
              issues.push({
                paperId: paper.id,
                examId,
                editionYear: year,
                questionNumber: qNum,
                type: 'KATEX_ERROR',
                details: `LaTeX syntax error in stem: "${latex}" - ${err?.message || ''}`,
              });
            }
          }
        }
      }

      // Check options
      if ((qType === 'MCQ' || qType === 'MSQ') && !paper.id.includes('descriptive')) {
        const numOpts = Math.max(options.length, richOpts.length);
        if (examId === 'ssc-chsl' && numOpts !== 4) {
          issues.push({
            paperId: paper.id,
            examId,
            editionYear: year,
            questionNumber: qNum,
            type: 'WRONG_OPTION_COUNT',
            details: `SSC CHSL requires 4 options, found ${numOpts}`,
          });
        }

        for (let optIdx = 0; optIdx < numOpts; optIdx++) {
          const optStr = options[optIdx] ?? '';
          const richOpt = richOpts[optIdx];
          let optImg = (richOpt?.imageUrl) || (optImages[optIdx]) || null;
          let optText = '';

          if (typeof optStr === 'object' && optStr !== null) {
            optText = ((optStr as any).text || '').trim();
            if (!optImg) optImg = (optStr as any).imageUrl || null;
          } else if (typeof optStr === 'string') {
            optText = optStr.trim();
          }

          if (richOpt) {
            if (!optText) optText = (richOpt.text || '').trim();
          }

          const richBlocks = richOpt?.contentBlocks || [];
          const isEmpty = !optText && !optImg && richBlocks.length === 0;

          if (isEmpty) {
            issues.push({
              paperId: paper.id,
              examId,
              editionYear: year,
              questionNumber: qNum,
              type: 'EMPTY_OPTION',
              optionIndex: optIdx,
              details: `Option ${['A', 'B', 'C', 'D'][optIdx] || optIdx} is completely blank (no text, image, or blocks)`,
            });
          }

          if (optImg && typeof optImg === 'string' && optImg.startsWith('/')) {
            assetUrlsToTest.add(optImg);
            const list = assetToQuestionsMap.get(optImg) || [];
            list.push({ paperId: paper.id, examId, year, qNum, optIdx });
            assetToQuestionsMap.set(optImg, list);
          }
        }
      }
    }
  }

  // Step 2: Check asset availability via browser network / Image DOM probe
  if (checkImages && assetUrlsToTest.size > 0) {
    const urls = Array.from(assetUrlsToTest);
    const brokenUrls = new Set<string>();

    for (let i = 0; i < urls.length; i += concurrency) {
      const chunk = urls.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (url) => {
          const exists = await verifyImageExists(url);
          if (!exists) {
            brokenUrls.add(url);
          }
        })
      );
    }

    for (const brokenUrl of brokenUrls) {
      const occurrences = assetToQuestionsMap.get(brokenUrl) || [];
      for (const occ of occurrences) {
        issues.push({
          paperId: occ.paperId,
          examId: occ.examId,
          editionYear: occ.year,
          questionNumber: occ.qNum,
          optionIndex: occ.optIdx,
          type: 'MISSING_IMAGE_404',
          assetUrl: brokenUrl,
          details: `Image asset failed to load in browser (404/error): ${brokenUrl}`,
        });
      }
    }
  }

  // Step 3: Aggregate issues
  const issuesByType: Record<string, number> = {};
  const issuesByExamYear: Record<string, number> = {};
  const issuesByPaperMap = new Map<string, AuditIssue[]>();

  for (const issue of issues) {
    issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    const groupKey = `${issue.examId}-${issue.editionYear}`;
    issuesByExamYear[groupKey] = (issuesByExamYear[groupKey] || 0) + 1;

    const list = issuesByPaperMap.get(issue.paperId) || [];
    list.push(issue);
    issuesByPaperMap.set(issue.paperId, list);
  }

  const problemPapers = Array.from(issuesByPaperMap.entries()).map(([paperId, paperIssues]) => {
    const first = paperIssues[0];
    return {
      paperId,
      examId: first.examId,
      editionYear: first.editionYear,
      issueCount: paperIssues.length,
      issues: paperIssues,
    };
  });

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    totalPapers: papers.length,
    cleanPapers: papers.length - problemPapers.length,
    papersWithIssues: problemPapers.length,
    totalIssues: issues.length,
    issues,
    issuesByType,
    issuesByExamYear,
    problemPapers,
  };

  return report;
}

// Expose on window for browser console and subagent execution
if (typeof window !== 'undefined') {
  (window as any).__AUDIT_ALL_PAPERS__ = auditAllPapers;
  (window as any).__GET_PAPER__ = (id: string) => EXAM_PAPERS_MAP[id];
  (window as any).__GET_ALL_PAPER_IDS__ = () => Object.keys(EXAM_PAPERS_MAP);
}
