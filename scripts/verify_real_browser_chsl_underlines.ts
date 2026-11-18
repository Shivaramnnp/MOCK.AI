import * as path from 'path';
import * as fs from 'fs';
import puppeteer from '../web/node_modules/puppeteer-core';
import { createServer as createViteServer } from '../web/node_modules/vite';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5199;

interface TargetCheck {
  questionNumber: number;
  expectedUnderline: string;
  surroundingContext: string;
  isExample: boolean;
}

const TARGET_QUESTIONS: TargetCheck[] = [
  { questionNumber: 3, expectedUnderline: 'down with', surroundingContext: 'I am', isExample: false },
  { questionNumber: 10, expectedUnderline: 'when he burnt', surroundingContext: 'The little boy cried with pain', isExample: false },
  { questionNumber: 14, expectedUnderline: 'sold plots like hot cakes', surroundingContext: 'The realtors of the new venture', isExample: false },
  { questionNumber: 15, expectedUnderline: 'guard the nest at night', surroundingContext: 'It is a general belief that the female ostrich', isExample: true },
  { questionNumber: 16, expectedUnderline: 'conspicuous', surroundingContext: 'The skunk had a', isExample: true },
  { questionNumber: 17, expectedUnderline: 'joyless', surroundingContext: 'How can you be so', isExample: true },
  { questionNumber: 20, expectedUnderline: 'strong', surroundingContext: 'Rahul had', isExample: true },
  { questionNumber: 21, expectedUnderline: 'support', surroundingContext: 'Would you please', isExample: true },
  { questionNumber: 25, expectedUnderline: 'This is best book', surroundingContext: 'for children to read.', isExample: false },
];

async function runRealBrowserUnderlineVerification() {
  console.log('================================================================');
  console.log('MOCK.AI — REAL-BROWSER AUDIT: UNDERLINE RENDERING IN EXAM PLAYER');
  console.log(`Browser: ${CHROME_PATH}`);
  console.log(`Vite Port: ${VITE_PORT}`);
  console.log('================================================================\n');

  const paperPath = path.resolve(__dirname, '../web/src/data/exams/ssc-chsl-2024-01jul-s1.json');
  const paper = JSON.parse(fs.readFileSync(paperPath, 'utf8'));

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
  const results: any[] = [];

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

    await page.goto(`http://127.0.0.1:${VITE_PORT}/candidate-rehearsal.html`, { waitUntil: 'domcontentloaded' });

    // Inject configuration
    await page.evaluate((examPaper: any) => {
      window.__REHEARSAL_CONFIG__ = {
        gatewayUrl: 'http://127.0.0.1:54321',
        token: 'mock_token',
        tenantId: 'mock_tenant',
        candidateId: 'cand_underline_verifier',
        paper: examPaper,
      };
    }, paper);

    await page.waitForSelector('#rehearsal-player-container', { timeout: 10000 });
    console.log('✓ Candidate Exam Player successfully mounted in browser.\n');

    for (const target of TARGET_QUESTIONS) {
      console.log(`Auditing Q${target.questionNumber} ${target.isExample ? '(User Example)' : ''}...`);

      // Click question button in question palette
      const navigated = await page.evaluate((qNum: number) => {
        // Palette buttons show question numbers 1..100
        const buttons = Array.from(document.querySelectorAll('button'));
        const qBtn = buttons.find((b) => b.textContent?.trim() === String(qNum));
        if (qBtn) {
          qBtn.click();
          return true;
        }
        return false;
      }, target.questionNumber);

      if (!navigated) {
        throw new Error(`Could not find palette button for Question ${target.questionNumber}`);
      }

      await new Promise((r) => setTimeout(r, 400));

      // Inspect DOM and computed styles inside question container
      const inspectData = await page.evaluate(() => {
        // The question container
        const player = document.querySelector('#rehearsal-player-container');
        if (!player) return { error: 'No player container' };

        const uElements = Array.from(player.querySelectorAll('u'));
        const uDetails = uElements.map((el) => {
          const style = window.getComputedStyle(el);
          return {
            text: el.textContent?.trim(),
            textDecorationLine: style.textDecorationLine,
            textDecorationStyle: style.textDecorationStyle,
            textDecorationThickness: style.textDecorationThickness,
            display: style.display,
            html: el.outerHTML,
          };
        });

        // Current question header text e.g. "Question 15 of 100"
        const headerText = player.querySelector('h3, .text-xs, .text-sm')?.textContent || '';

        // All stem text
        const stemEl = player.querySelector('.leading-relaxed');
        const stemText = stemEl ? stemEl.textContent?.trim() : '';

        return {
          headerText,
          stemText,
          uCount: uElements.length,
          uDetails,
        };
      });

      console.log(`   Header: ${inspectData.headerText}`);
      console.log(`   u-count: ${inspectData.uCount}`);
      console.log(`   Underlined text: "${inspectData.uDetails[0]?.text}"`);
      console.log(`   Computed text-decoration-line: "${inspectData.uDetails[0]?.textDecorationLine}"`);
      console.log(`   Computed text-decoration-thickness: "${inspectData.uDetails[0]?.textDecorationThickness}"`);

      // Assertions
      const matchedText = inspectData.uDetails[0]?.text === target.expectedUnderline;
      const isUnderlined = inspectData.uDetails[0]?.textDecorationLine.includes('underline');
      const singleU = inspectData.uCount === 1;

      if (!matchedText) {
        console.error(`   ❌ Text mismatch! Expected "${target.expectedUnderline}", got "${inspectData.uDetails[0]?.text}"`);
      } else if (!isUnderlined) {
        console.error(`   ❌ Not styled with underline! Got "${inspectData.uDetails[0]?.textDecorationLine}"`);
      } else if (!singleU) {
        console.error(`   ❌ Unexpected multiple <u> elements: ${inspectData.uCount}`);
      } else {
        console.log(`   🟢 VERIFIED CLEAN`);
      }

      results.push({
        questionNumber: target.questionNumber,
        expectedUnderline: target.expectedUnderline,
        actualUnderline: inspectData.uDetails[0]?.text,
        textDecorationLine: inspectData.uDetails[0]?.textDecorationLine,
        pass: matchedText && isUnderlined && singleU,
      });
    }

    // Negative control test: Q1 (no underline)
    console.log('\nAuditing Negative Control Q1 (non-underlined question)...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const q1Btn = buttons.find((b) => b.textContent?.trim() === '1');
      if (q1Btn) q1Btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const q1Data = await page.evaluate(() => {
      const player = document.querySelector('#rehearsal-player-container');
      const uCount = player ? player.querySelectorAll('u').length : 0;
      return { uCount };
    });
    console.log(`   Q1 u-count: ${q1Data.uCount} (expected: 0)`);
    const q1Pass = q1Data.uCount === 0;
    console.log(`   ${q1Pass ? '🟢 VERIFIED CLEAN: No spurious underlines' : '❌ FAILED'}`);

    // Summary table
    console.log('\n================================================================');
    console.log('BROWSER VERIFICATION SUMMARY');
    console.log('================================================================');
    console.table(results);

    const allPassed = results.every((r) => r.pass) && q1Pass && pageErrors.length === 0;
    if (pageErrors.length > 0) {
      console.warn('Page errors encountered:', pageErrors);
    }

    if (allPassed) {
      console.log('\n🎉 ALL REAL-BROWSER UNDERLINE VERIFICATION CHECKS PASSED PERFECTLY!\n');
    } else {
      console.error('\n❌ SOME CHECKS FAILED!\n');
      process.exit(1);
    }
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

runRealBrowserUnderlineVerification().catch((err) => {
  console.error('Fatal error in browser verification:', err);
  process.exit(1);
});
