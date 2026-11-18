import * as path from 'path';
import * as fs from 'fs';
import puppeteer from '../web/node_modules/puppeteer-core';
import { createServer as createViteServer } from '../web/node_modules/vite';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5197;

interface TargetDefect {
  paperCode: string;
  paperName: string;
  questionNumber: number;
  expectedTokens: string[];
  forbiddenSubstrings: string[];
}

const TARGETS: TargetDefect[] = [
  {
    paperCode: 'cs',
    paperName: 'GATE 2023 Computer Science (CS)',
    questionNumber: 48,
    expectedTokens: ['binom', '2k'],
    forbiddenSubstrings: ['\x0f', '\x10', 'Page 33 of', 'KATEX_TOKEN', '\\binom', '\\times'],
  },
  {
    paperCode: 'in',
    paperName: 'GATE 2023 Instrumentation Engineering (IN)',
    questionNumber: 61,
    expectedTokens: ['230', '50'],
    forbiddenSubstrings: ['\\frac{230}{\\sqrt{2}\\})', 'KATEX_TOKEN', '\\frac'],
  },
  {
    paperCode: 'ph',
    paperName: 'GATE 2023 Physics (PH)',
    questionNumber: 57,
    expectedTokens: ['∇', 'r', 'z'],
    forbiddenSubstrings: ['\u0302', '\u20d7', 'KATEX_TOKEN', '\\nabla', '\\hat', '\\vec'],
  },
];

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('MOCK.AI — REAL-BROWSER VALIDATION: RESIDUAL DEFECTS (CS, IN, PH)');
  console.log(`Browser Binary: ${CHROME_PATH}`);
  console.log(`Vite Port: ${VITE_PORT}`);
  console.log('================================================================\n');

  const viteServer = await createViteServer({
    root: path.resolve(__dirname, '../web'),
    server: {
      port: VITE_PORT,
      strictPort: true,
      host: '127.0.0.1',
    },
  });
  await viteServer.listen();
  console.log(`✓ Vite Dev Server listening on http://127.0.0.1:${VITE_PORT}\n`);

  let browser: any;
  const auditResults: Record<string, any> = {};

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const pageErrors: string[] = [];
    page.on('pageerror', (err: any) => {
      pageErrors.push(err.message);
    });

    for (const target of TARGETS) {
      console.log(`\n================================================================`);
      console.log(`Auditing ${target.paperName} — Question ${target.questionNumber}`);
      console.log(`================================================================`);

      const paperPath = path.resolve(__dirname, `../web/src/data/exams/gate-2023-${target.paperCode}.json`);
      if (!fs.existsSync(paperPath)) {
        throw new Error(`Exam paper not found at ${paperPath}`);
      }
      const paper = JSON.parse(fs.readFileSync(paperPath, 'utf8'));

      // Navigate to rehearsal entry point
      await page.goto(`http://127.0.0.1:${VITE_PORT}/candidate-rehearsal.html`, { waitUntil: 'domcontentloaded' });

      // Inject configuration into window.__REHEARSAL_CONFIG__
      await page.evaluate((examPaper: any) => {
        window.__REHEARSAL_CONFIG__ = {
          gatewayUrl: 'http://127.0.0.1:54321',
          token: 'mock_token',
          tenantId: 'mock_tenant',
          candidateId: 'cand_verifier',
          paper: examPaper,
        };
      }, paper);

      // Wait for player container to mount
      await page.waitForSelector('#rehearsal-player-container', { timeout: 10000 });

      // Switch section tab if target question is in core engineering/science section (num > 10)
      if (target.questionNumber > 10) {
        await page.evaluate(() => {
          const secBtns = Array.from(document.querySelectorAll('button'));
          const coreBtn = secBtns.find(b => {
            const txt = b.textContent?.trim() || '';
            return !txt.includes('General Aptitude') && (
              txt.includes('Computer Science') ||
              txt.includes('Instrumentation') ||
              txt.includes('Physics') ||
              txt.includes('Engineering')
            );
          });
          if (coreBtn) coreBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));
      }

      // Click palette button for target question
      const jumped = await page.evaluate((num: number) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => {
          const title = b.getAttribute('title') || '';
          return title.startsWith(`Question ${num}`) || b.textContent?.trim() === String(num);
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, target.questionNumber);

      if (!jumped) {
        throw new Error(`Could not jump to Question ${target.questionNumber} in ${target.paperCode}`);
      }

      // Small delay to allow React state transition and KaTeX rendering
      await new Promise(r => setTimeout(r, 600));

      // Inspect rendered DOM
      const domData = await page.evaluate((qNum: number, forbidden: string[]) => {
        const container = document.querySelector('#rehearsal-player-container');
        if (!container) return { error: 'No player container' };

        const contentContainer = container.querySelector('.text-sm.sm\\:text-base');
        const promptHtml = contentContainer?.innerHTML || '';
        const promptText = contentContainer?.textContent || '';

        const katexElements = Array.from(container.querySelectorAll('.katex')).map(el => el.textContent?.trim() || '');
        const katexErrors = Array.from(container.querySelectorAll('.katex-error')).map(el => el.textContent?.trim() || '');

        const optionContainers = Array.from(container.querySelectorAll('.option-content')).map((opt, idx) => ({
          index: idx,
          text: opt.textContent?.trim() || '',
          html: opt.innerHTML,
          katexCount: opt.querySelectorAll('.katex').length,
          katexErrors: Array.from(opt.querySelectorAll('.katex-error')).map(e => e.textContent?.trim() || ''),
        }));

        const combinedText = promptText + ' ' + optionContainers.map(o => o.text).join(' ');
        const combinedHtml = promptHtml + ' ' + optionContainers.map(o => o.html).join(' ');

        // Check for control characters
        const ctrlCharMatches = combinedText.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || [];
        // Check for PUA characters
        const puaMatches = combinedText.match(/[\uE000-\uF8FF]/g) || [];
        // Check for combining accents
        const combiningAccents = combinedText.match(/[\u0300-\u036F\u20D0-\u20FF]/g) || [];
        // Check for forbidden substrings
        const forbiddenFound = forbidden.filter(f => combinedText.includes(f) || combinedHtml.includes(f));
        // Check for raw LaTeX syntax leaked as literal text
        const rawLatexRegex = /\\(?:displaystyle|frac|le|ge|ne|alpha|beta|gamma|theta|times|sqrt|partial|nabla|binom|hat|vec)/g;
        const rawLatexMatches = combinedText.match(rawLatexRegex) || [];

        return {
          questionNumber: qNum,
          promptText: promptText.trim(),
          katexElementCount: katexElements.length,
          katexErrors,
          options: optionContainers,
          ctrlCharMatches,
          puaMatches,
          combiningAccents,
          forbiddenFound,
          rawLatexMatches,
        };
      }, target.questionNumber, target.forbiddenSubstrings);

      auditResults[`${target.paperCode}_q${target.questionNumber}`] = domData;

      console.log(`  Prompt text: "${domData.promptText.slice(0, 160)}..."`);
      console.log(`  Total KaTeX elements: ${domData.katexElementCount}`);
      console.log(`  KaTeX parse errors: ${domData.katexErrors.length}`);
      if (domData.katexErrors.length > 0) {
        console.error(`    FAILED KaTeX errors:`, domData.katexErrors);
      }
      console.log(`  Options count: ${domData.options.length}`);
      for (const opt of domData.options) {
        console.log(`    - Option ${opt.index + 1}: katex=${opt.katexCount}, errors=${opt.katexErrors.length}, text="${opt.text.slice(0, 60)}"`);
      }
      console.log(`  Control char leaks: ${domData.ctrlCharMatches.length}`);
      console.log(`  PUA char leaks: ${domData.puaMatches.length}`);
      console.log(`  Combining accents leaks: ${domData.combiningAccents.length}`);
      console.log(`  Forbidden substrings found: ${domData.forbiddenFound.length}`);
      if (domData.forbiddenFound.length > 0) {
        console.error(`    FAILED Forbidden substrings:`, domData.forbiddenFound);
      }
      console.log(`  Raw LaTeX in text: ${domData.rawLatexMatches.length}`);
      if (domData.rawLatexMatches.length > 0) {
        console.error(`    FAILED Raw LaTeX leaks:`, domData.rawLatexMatches);
      }

      // Assertions
      const hasErrors =
        domData.katexErrors.length > 0 ||
        domData.ctrlCharMatches.length > 0 ||
        domData.puaMatches.length > 0 ||
        domData.combiningAccents.length > 0 ||
        domData.forbiddenFound.length > 0 ||
        domData.rawLatexMatches.length > 0;

      if (hasErrors) {
        throw new Error(`Defect verification failed for ${target.paperCode} Q${target.questionNumber}`);
      }
      console.log(`  ✓ PASS: Question ${target.questionNumber} rendered cleanly with zero KaTeX errors or token leaks.`);
    }

    if (pageErrors.length > 0) {
      console.error('Browser page errors:', pageErrors);
      throw new Error(`Page errors detected during verification: ${pageErrors.join(', ')}`);
    }

    console.log('\n================================================================');
    console.log('✓ ALL 3 RESIDUAL DEFECT BROWSER REHEARSAL CHECKS PASSED');
    console.log('================================================================\n');
    return auditResults;
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

runBrowserVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
