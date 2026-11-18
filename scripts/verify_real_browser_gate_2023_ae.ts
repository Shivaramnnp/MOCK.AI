import * as path from 'path';
import * as fs from 'fs';
import puppeteer from '../web/node_modules/puppeteer-core';
import { createServer as createViteServer } from '../web/node_modules/vite';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5199;

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('MOCK.AI — REAL-BROWSER VALIDATION: GATE 2023 AEROSPACE (AE)');
  console.log(`Browser Binary: ${CHROME_PATH}`);
  console.log(`Vite Port: ${VITE_PORT}`);
  console.log('================================================================\n');

  // Load canonical exam paper
  const paperPath = path.resolve(__dirname, '../web/src/data/exams/gate-2023-ae.json');
  if (!fs.existsSync(paperPath)) {
    throw new Error(`Exam paper not found at ${paperPath}`);
  }
  const paper = JSON.parse(fs.readFileSync(paperPath, 'utf8'));
  console.log(`✓ Loaded exam paper: ${paper.title} (${paper.questions.length} questions)`);

  // Start Vite Dev Server
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
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const consoleLogs: string[] = [];
    const pageErrors: string[] = [];
    const assetResponses: Array<{ url: string; status: number }> = [];

    page.on('console', (msg: any) => {
      const text = msg.text();
      if (!text.includes('[vite]') && !text.includes('React DevTools')) {
        consoleLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    page.on('pageerror', (err: any) => {
      pageErrors.push(err.message);
    });

    page.on('response', (res: any) => {
      const url = res.request().url();
      if (url.includes('/exam-assets/')) {
        assetResponses.push({ url, status: res.status() });
      }
    });

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
    console.log('✓ Candidate application mounted successfully in real Google Chrome runtime.\n');

    const targetQuestions = [30, 41, 45, 54];
    const results: Record<number, any> = {};

    for (const qNum of targetQuestions) {
      console.log(`--- Inspecting Question ${qNum} ---`);

      // Click the section tab first if question is in Aerospace Engineering (num > 10)
      if (qNum > 10) {
        await page.evaluate(() => {
          const secBtns = Array.from(document.querySelectorAll('button'));
          const aeBtn = secBtns.find(b => b.textContent?.includes('Aerospace Engineering'));
          if (aeBtn) aeBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));
      }

      // Click the palette button for question qNum
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
      }, qNum);

      if (!jumped) {
        throw new Error(`Could not find palette button for Question ${qNum}`);
      }

      // Small delay to allow React state transition and KaTeX rendering
      await new Promise(r => setTimeout(r, 600));

      // Inspect rendered DOM for this question
      const qData = await page.evaluate((num: number) => {
        const puaRegex = /[\uE000-\uF8FF]/g;
        const katexTokenRegex = /KATEX_TOKEN/g;
        const rawLatexRegex = /\\(?:displaystyle|frac|le|ge|ne|alpha|beta|gamma|theta|times|sqrt|partial|nabla)/g;

        // Container
        const container = document.querySelector('#rehearsal-player-container');
        if (!container) return { error: 'No player container' };

        // Stem / Prompt element
        const contentContainer = container.querySelector('.text-sm.sm\\:text-base');
        const promptHtml = contentContainer?.innerHTML || '';
        const promptText = contentContainer?.textContent || '';

        // Diagrams in question
        const questionImgs = Array.from(container.querySelectorAll('img')).map((img: HTMLImageElement) => ({
          src: img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          alt: img.alt,
        }));

        // KaTeX rendered elements
        const katexElements = Array.from(container.querySelectorAll('.katex')).map(el => el.textContent?.trim() || '');
        const katexErrors = Array.from(container.querySelectorAll('.katex-error')).map(el => el.textContent?.trim() || '');

        // Option elements
        const optionContainers = Array.from(container.querySelectorAll('.option-content')).map((opt, idx) => {
          const optImgs = Array.from(opt.querySelectorAll('img')).map((img: HTMLImageElement) => ({
            src: img.src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            complete: img.complete,
            alt: img.alt,
          }));
          const optKatex = Array.from(opt.querySelectorAll('.katex')).map(el => el.textContent?.trim() || '');
          const optKatexErrors = Array.from(opt.querySelectorAll('.katex-error')).map(el => el.textContent?.trim() || '');
          return {
            index: idx,
            text: opt.textContent?.trim() || '',
            html: opt.innerHTML,
            images: optImgs,
            katexCount: optKatex.length,
            katexErrors: optKatexErrors,
          };
        });

        // Residual corruption check
        const puaMatches = (promptHtml + ' ' + optionContainers.map(o => o.html).join(' ')).match(puaRegex) || [];
        const tokenMatches = (promptHtml + ' ' + optionContainers.map(o => o.html).join(' ')).match(katexTokenRegex) || [];
        const rawLatexMatches = (promptText + ' ' + optionContainers.map(o => o.text).join(' ')).match(rawLatexRegex) || [];
        const parenRepetition = promptText.includes('( ( (') || promptText.includes(') ) )');

        return {
          questionNumber: num,
          promptTextSummary: promptText.slice(0, 180) + '...',
          katexRenderedCount: katexElements.length,
          katexErrors,
          puaFound: Array.from(new Set(puaMatches)),
          tokenFound: Array.from(new Set(tokenMatches)),
          rawLatexFound: Array.from(new Set(rawLatexMatches)),
          parenRepetition,
          questionImages: questionImgs,
          options: optionContainers,
        };
      }, qNum);

      results[qNum] = qData;

      console.log(`  Prompt text: "${qData.promptTextSummary}"`);
      console.log(`  KaTeX formulas rendered: ${qData.katexRenderedCount}`);
      console.log(`  KaTeX errors: ${qData.katexErrors.length}`);
      console.log(`  PUA matches: ${qData.puaFound.length}`);
      console.log(`  Token leaks: ${qData.tokenFound.length}`);
      console.log(`  Raw LaTeX in text: ${qData.rawLatexFound.length}`);
      console.log(`  Parenthesis repetition '( ( (': ${qData.parenRepetition ? 'YES (FAIL)' : 'NO (CLEAN)'}`);
      console.log(`  Diagrams: ${qData.questionImages.length} found`);
      for (const img of qData.questionImages) {
        console.log(`    - Diagram: ${img.src} [${img.naturalWidth}x${img.naturalHeight}] complete: ${img.complete}`);
      }
      console.log(`  Options rendered: ${qData.options.length}`);
      for (const opt of qData.options) {
        console.log(`    - Opt ${opt.index}: text="${opt.text.slice(0, 60)}" images=${opt.images.length} katex=${opt.katexCount} errors=${opt.katexErrors.length}`);
        for (const img of opt.images) {
          console.log(`      * Opt Image: ${img.src} [${img.naturalWidth}x${img.naturalHeight}] complete: ${img.complete}`);
        }
      }
      console.log('');
    }

    console.log('--- Network & Console Summary ---');
    console.log(`Asset HTTP Requests: ${assetResponses.length}`);
    for (const a of assetResponses) {
      console.log(`  ${a.status === 200 ? '✓' : '✗'} [HTTP ${a.status}] ${a.url}`);
    }
    console.log(`Console Logs: ${consoleLogs.length}`);
    console.log(`Page Errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error('Page errors encountered:', pageErrors);
    }

    console.log('\n================================================================');
    console.log('REAL-BROWSER AUDIT VERIFICATION COMPLETE');
    console.log('================================================================\n');

    return { results, assetResponses, pageErrors };
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
