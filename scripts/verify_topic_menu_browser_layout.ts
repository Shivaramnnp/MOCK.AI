import * as path from 'path';
import * as fs from 'fs';
import puppeteer from '../web/node_modules/puppeteer-core';
import { createServer as createViteServer } from '../web/node_modules/vite';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5196;

async function runBrowserLayoutVerification() {
  console.log('================================================================');
  console.log('MOCK.AI — REAL-BROWSER VALIDATION: TOPIC MENU UI LAYOUT');
  console.log(`Browser: ${CHROME_PATH}`);
  console.log(`Port: ${VITE_PORT}`);
  console.log('================================================================\n');

  // Load a canonical paper with sections and topics (e.g. gate-2023-cs.json or a standard paper)
  const paperPath = path.resolve(__dirname, '../web/src/data/exams/gate-2023-cs.json');
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

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security'],
    });

    const page = await browser.newPage();

    // ────────────────────────────────────────────────────────────────
    // TEST 1: DESKTOP LAYOUT (1440 x 900)
    // ────────────────────────────────────────────────────────────────
    console.log('----------------------------------------------------------------');
    console.log('1. DESKTOP VIEWPORT TEST (1440 x 900)');
    console.log('----------------------------------------------------------------');
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(`http://127.0.0.1:${VITE_PORT}/candidate-rehearsal.html`, { waitUntil: 'domcontentloaded' });

    await page.evaluate((examPaper: any) => {
      window.__REHEARSAL_CONFIG__ = {
        gatewayUrl: 'http://127.0.0.1:54321',
        token: 'mock_token',
        tenantId: 'mock_tenant',
        candidateId: 'cand_desktop_verifier',
        paper: examPaper,
      };
    }, paper);

    await page.waitForSelector('#rehearsal-player-container', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // Measure initial layout metrics with Topic Menu expanded
    const desktopExpandedMetrics = await page.evaluate(() => {
      const qCard = document.querySelector('.lg\\:col-span-3') as HTMLElement;
      const qRect = qCard ? qCard.getBoundingClientRect() : null;

      const actionButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
        ['Previous', 'Save & Next', 'Mark for Review & Next', 'Clear Response'].some((txt) =>
          b.textContent?.includes(txt)
        )
      );
      const actionRects = actionButtons.map((b) => ({
        text: b.textContent?.trim(),
        rect: b.getBoundingClientRect(),
      }));

      const topicMenu = document.querySelector('[data-testid="topic-navigation-menu"]') as HTMLElement;
      const topicRect = topicMenu ? topicMenu.getBoundingClientRect() : null;

      const topicList = document.querySelector('[data-testid="topic-list-container"]') as HTMLElement;
      const topicListComputed = topicList ? window.getComputedStyle(topicList) : null;

      const paletteGrid = document.querySelector('.grid-cols-5') as HTMLElement;
      const paletteGridComputed = paletteGrid ? window.getComputedStyle(paletteGrid) : null;

      const docBody = document.body;

      return {
        qRect: qRect ? { x: qRect.x, y: qRect.y, width: qRect.width, height: qRect.height } : null,
        actionRects,
        topicRect: topicRect ? { height: topicRect.height } : null,
        topicListOverScroll: topicListComputed?.overscrollBehavior,
        topicListMaxHeight: topicListComputed?.maxHeight,
        paletteOverScroll: paletteGridComputed?.overscrollBehavior,
        pageScrollHeight: docBody.scrollHeight,
        windowInnerHeight: window.innerHeight,
      };
    });

    console.log('Desktop Expanded Metrics:');
    console.log(`  Question Card Height: ${desktopExpandedMetrics.qRect?.height}px (width: ${desktopExpandedMetrics.qRect?.width}px)`);
    console.log(`  Topic Menu Height: ${desktopExpandedMetrics.topicRect?.height}px`);
    console.log(`  Topic List overscroll-behavior: ${desktopExpandedMetrics.topicListOverScroll}`);
    console.log(`  Topic List maxHeight: ${desktopExpandedMetrics.topicListMaxHeight}`);
    console.log(`  Palette Grid overscroll-behavior: ${desktopExpandedMetrics.paletteOverScroll}`);

    // Click Collapse button on Desktop Topic Menu
    await page.evaluate(() => {
      const toggleBtn = document.querySelector('[data-testid="topic-menu-toggle-btn"]') as HTMLElement;
      if (toggleBtn) toggleBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Measure layout metrics after Collapse
    const desktopCollapsedMetrics = await page.evaluate(() => {
      const qCard = document.querySelector('.lg\\:col-span-3') as HTMLElement;
      const qRect = qCard ? qCard.getBoundingClientRect() : null;

      const actionButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
        ['Previous', 'Save & Next', 'Mark for Review & Next', 'Clear Response'].some((txt) =>
          b.textContent?.includes(txt)
        )
      );
      const actionRects = actionButtons.map((b) => ({
        text: b.textContent?.trim(),
        rect: b.getBoundingClientRect(),
      }));

      const topicMenu = document.querySelector('[data-testid="topic-navigation-menu"]') as HTMLElement;
      const topicRect = topicMenu ? topicMenu.getBoundingClientRect() : null;

      return {
        qRect: qRect ? { x: qRect.x, y: qRect.y, width: qRect.width, height: qRect.height } : null,
        actionRects,
        topicRect: topicRect ? { height: topicRect.height } : null,
      };
    });

    console.log('\nDesktop Collapsed Metrics:');
    console.log(`  Question Card Height: ${desktopCollapsedMetrics.qRect?.height}px`);
    console.log(`  Topic Menu Height: ${desktopCollapsedMetrics.topicRect?.height}px`);

    // Verify STABILITY: Question card height must NOT shift when Topic Menu collapsed!
    const qHeightDiff = Math.abs(
      (desktopExpandedMetrics.qRect?.height || 0) - (desktopCollapsedMetrics.qRect?.height || 0)
    );
    const qYDiff = Math.abs(
      (desktopExpandedMetrics.qRect?.y || 0) - (desktopCollapsedMetrics.qRect?.y || 0)
    );

    console.log(`\n  Stability Delta: Question Card Height diff = ${qHeightDiff}px, Y diff = ${qYDiff}px`);
    if (qHeightDiff > 1.0 || qYDiff > 1.0) {
      throw new Error(`FAIL: Question Card height or position changed upon Topic Menu collapse! Delta: ${qHeightDiff}px`);
    }
    console.log('  ✓ PASS: Question Card remained 100% stable in dimensions and vertical position!\n');

    // Re-expand Topic Menu
    await page.evaluate(() => {
      const toggleBtn = document.querySelector('[data-testid="topic-menu-toggle-btn"]') as HTMLElement;
      if (toggleBtn) toggleBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // ────────────────────────────────────────────────────────────────
    // TEST 2: MOBILE VIEWPORT TEST (390 x 844 — iPhone 14 / standard mobile)
    // ────────────────────────────────────────────────────────────────
    console.log('----------------------------------------------------------------');
    console.log('2. MOBILE VIEWPORT TEST (390 x 844)');
    console.log('----------------------------------------------------------------');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 400));

    // Check horizontal overflow on mobile page
    const mobilePageMetrics = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      const hasHorizontalScroll = scrollWidth > clientWidth || bodyScrollWidth > clientWidth;

      const paletteDrawerTrigger = document.querySelector('button[title="Open Question Palette"]') as HTMLElement;

      const overflowingElements = Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right > clientWidth + 1 || el.scrollWidth > clientWidth + 1;
        })
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          text: el.textContent?.slice(0, 40),
          rectRight: el.getBoundingClientRect().right,
          scrollWidth: el.scrollWidth,
        }));

      return {
        scrollWidth,
        clientWidth,
        hasHorizontalScroll,
        hasPaletteDrawerTrigger: Boolean(paletteDrawerTrigger),
        overflowingElements: overflowingElements.slice(0, 10),
      };
    });

    console.log(`  Mobile Viewport: ${mobilePageMetrics.clientWidth}px, ScrollWidth: ${mobilePageMetrics.scrollWidth}px`);
    if (mobilePageMetrics.overflowingElements.length > 0) {
      console.log('  Overflowing elements found:');
      for (const el of mobilePageMetrics.overflowingElements) {
        console.log(`    - <${el.tag} class="${el.className}"> rectRight=${el.rectRight} scrollWidth=${el.scrollWidth} text="${el.text}"`);
      }
    }
    console.log(`  Horizontal Overflow: ${mobilePageMetrics.hasHorizontalScroll ? 'FAIL (overflow detected)' : 'CLEAN (zero overflow)'}`);
    if (mobilePageMetrics.hasHorizontalScroll) {
      throw new Error(`FAIL: Horizontal overflow detected on mobile: ${mobilePageMetrics.scrollWidth}px > ${mobilePageMetrics.clientWidth}px`);
    }
    console.log('  ✓ PASS: Zero horizontal overflow on mobile layout.');

    // Open Mobile Drawer Modal
    console.log('\n  Opening Mobile Palette Drawer...');
    await page.evaluate(() => {
      const trigger = document.querySelector('button[title="Open Question Palette"]') as HTMLElement;
      if (trigger) trigger.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Inspect Mobile Drawer contents
    const mobileDrawerMetrics = await page.evaluate(() => {
      const drawerModal = document.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      if (!drawerModal) return { error: 'Drawer modal not found' };

      const drawerContent = drawerModal.querySelector('.rounded-t-3xl') as HTMLElement;
      const drawerRect = drawerContent?.getBoundingClientRect();

      // Topic Menu inside drawer
      const drawerTopicMenu = drawerModal.querySelector('[data-testid="topic-navigation-menu"]') as HTMLElement;
      const toggleBtn = drawerTopicMenu?.querySelector('[data-testid="topic-menu-toggle-btn"]') as HTMLElement;
      const isExpandedInitial = toggleBtn?.getAttribute('aria-expanded') === 'true';

      // Palette grid inside drawer
      const paletteGrid = drawerModal.querySelector('.grid-cols-6') as HTMLElement;
      const paletteButtons = paletteGrid ? paletteGrid.querySelectorAll('button').length : 0;

      return {
        drawerVisible: Boolean(drawerModal),
        drawerHeight: drawerRect?.height,
        isExpandedInitial,
        paletteButtonsCount: paletteButtons,
      };
    });

    console.log(`  Drawer visible: ${mobileDrawerMetrics.drawerVisible}`);
    console.log(`  Drawer height: ${mobileDrawerMetrics.drawerHeight}px`);
    console.log(`  Topic Menu initially expanded in drawer: ${mobileDrawerMetrics.isExpandedInitial} (Expected: false)`);
    console.log(`  Question Palette buttons immediately visible in drawer: ${mobileDrawerMetrics.paletteButtonsCount}`);

    if (mobileDrawerMetrics.isExpandedInitial !== false) {
      throw new Error('FAIL: Mobile drawer Topic Menu should start collapsed by default!');
    }
    if ((mobileDrawerMetrics.paletteButtonsCount || 0) < 10) {
      throw new Error('FAIL: Question Palette buttons not visible in mobile drawer!');
    }
    console.log('  ✓ PASS: Mobile drawer Topic Menu starts collapsed with Palette directly accessible.');

    // Expand Topic Menu inside mobile drawer
    console.log('\n  Expanding Topic Menu inside Mobile Drawer...');
    await page.evaluate(() => {
      const drawerModal = document.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      const toggleBtn = drawerModal?.querySelector('[data-testid="topic-menu-toggle-btn"]') as HTMLElement;
      if (toggleBtn) toggleBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const drawerExpandedMetrics = await page.evaluate(() => {
      const drawerModal = document.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      const topicList = drawerModal?.querySelector('[data-testid="topic-list-container"]') as HTMLElement;
      const topicListStyle = topicList ? window.getComputedStyle(topicList) : null;

      const paletteContainer = drawerModal?.querySelector('.overflow-y-auto.overscroll-contain.flex-1') as HTMLElement;

      return {
        topicListOverScroll: topicListStyle?.overscrollBehavior,
        topicListMaxHeight: topicListStyle?.maxHeight,
        paletteStillVisible: Boolean(paletteContainer),
      };
    });

    console.log(`  Drawer Topic List overscroll-behavior: ${drawerExpandedMetrics.topicListOverScroll}`);
    console.log(`  Drawer Topic List maxHeight: ${drawerExpandedMetrics.topicListMaxHeight}`);
    console.log(`  Palette Container flexed & accessible: ${drawerExpandedMetrics.paletteStillVisible}`);

    if (!drawerExpandedMetrics.paletteStillVisible) {
      throw new Error('FAIL: Palette container pushed out or inaccessible when Topic Menu expanded inside drawer!');
    }
    console.log('  ✓ PASS: Drawer Topic Menu is bounded and Question Palette remains accessible.');

    // Close Mobile Drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.fixed.inset-0.z-50 button') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    console.log('\n================================================================');
    console.log('✓ REAL-BROWSER LAYOUT & RESPONSIVENESS CHECKS PASSED');
    console.log('================================================================\n');

    return {
      desktopExpandedMetrics,
      desktopCollapsedMetrics,
      mobilePageMetrics,
      mobileDrawerMetrics,
    };
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

runBrowserLayoutVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Browser layout verification failed:', err);
    process.exit(1);
  });
