const fs = require('fs');
const path = require('path');
const katex = require(path.resolve(__dirname, '../web/node_modules/katex'));

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../web/src/data/exams/gate-2024-da.json'), 'utf8'));

let mathCount = 0;
let errors = 0;
const errorDetails = [];

// Exact delimiter regex from LatexRenderer.tsx
const inlineRegex = /\\{1,2}\(([\s\S]+?)\\{1,2}\)/g;
const blockRegex = /\$\$([\s\S]+?)\$\$/g;

for (const q of data.questions) {
  const texts = [q.questionText, ...(q.options || [])];
  for (const t of texts) {
    if (!t) continue;
    let m;
    while ((m = inlineRegex.exec(t)) !== null) {
      mathCount++;
      const math = m[1].trim();
      try {
        katex.renderToString(math, { displayMode: false, throwOnError: true });
      } catch (err) {
        errors++;
        errorDetails.push({ q: q.questionNumber, math, error: err.message });
      }
    }
    while ((m = blockRegex.exec(t)) !== null) {
      mathCount++;
      const math = m[1].trim();
      try {
        katex.renderToString(math, { displayMode: true, throwOnError: true });
      } catch (err) {
        errors++;
        errorDetails.push({ q: q.questionNumber, math, error: err.message });
      }
    }
  }
}

console.log(`Audited ${mathCount} mathematical expressions in GATE 2024 DA.`);
console.log(`Total KaTeX errors: ${errors}`);
if (errors > 0) {
  console.log('Errors:', JSON.stringify(errorDetails.slice(0, 10), null, 2));
} else {
  console.log('ALL mathematical formulas render flawlessly in KaTeX!');
}
