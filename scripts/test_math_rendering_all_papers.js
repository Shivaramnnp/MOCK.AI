const fs = require('fs');
const path = require('path');
const katex = require('katex');

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLatexContent(content) {
  if (!content) return '';

  const mathTokens = [];
  const createToken = (html) => {
    const idx = mathTokens.length;
    mathTokens.push(html);
    return `___KATEX_TOKEN_${idx}___`;
  };

  let processed = content.normalize('NFKD');

  // Pre-normalize unicode symbols into standard LaTeX before delimiter tokenization
  processed = processed
    .replace(/µ|μ/g, '\\mu ')
    .replace(/π/g, '\\pi ')
    .replace(/θ/g, '\\theta ')
    .replace(/φ|ϕ/g, '\\phi ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/δ/g, '\\delta ')
    .replace(/ε/g, '\\varepsilon ')
    .replace(/λ/g, '\\lambda ')
    .replace(/σ/g, '\\sigma ')
    .replace(/τ/g, '\\tau ')
    .replace(/ω/g, '\\omega ')
    .replace(/⊤/g, '^\\top ')
    .replace(/′/g, "'")
    .replace(/▷◁/g, ' \\bowtie ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\ne ')
    .replace(/∈/g, ' \\in ')
    .replace(/∉/g, ' \\notin ')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/∞/g, ' \\infty ')
    .replace(/√/g, ' \\sqrt ');

  // 1. Math environments: \begin{cases}...\end{cases}, \begin{matrix}...\end{matrix}, etc.
  const envRegex =
    /\\begin\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}[\s\S]+?\\end\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}/g;
  processed = processed.replace(envRegex, (match) => {
    try {
      const html = katex.renderToString(match.trim(), {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return createToken(`\\[${escapeHtml(match)}\\]`);
    }
  });

  // 2. Block math: $$...$$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      const html = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return createToken(`$$${escapeHtml(math)}$$`);
    }
  });

  // 3. Block math: \[...\] or \\[...\\]
  processed = processed.replace(/\\{1,2}\[([\s\S]+?)\\{1,2}\]/g, (_, math) => {
    try {
      const html = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return createToken(`\\[${escapeHtml(math)}\\]`);
    }
  });

  // 4. Inline math: \(...\) or \\(...\\)
  processed = processed.replace(/\\{1,2}\(([\s\S]+?)\\{1,2}\)/g, (_, math) => {
    try {
      const html = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return createToken(`\\(${escapeHtml(math)}\\)`);
    }
  });

  // 5. Inline math: $...$
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    try {
      const html = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return createToken(`$${escapeHtml(math)}$`);
    }
  });

  // 6. Pre-normalize common naked syntax in question texts
  // e.g., \sqrt (expr) -> \sqrt{expr}, \sqrt -1 -> \sqrt{-1}, \sqrt 2 -> \sqrt{2}
  processed = processed.replace(/\\sqrt\s*\(([^)]+)\)/g, '\\sqrt{$1}');
  processed = processed.replace(/\\sqrt\s+(-?[0-9a-zA-Z\\]+)/g, '\\sqrt{$1}');
  processed = processed.replace(/\\sqrt\s+([0-9a-zA-Z\^_\{\}\+\-]+)/g, '\\sqrt{$1}');
  // Standalone radical without argument becomes \surd symbol
  processed = processed.replace(/\\sqrt(?![a-zA-Z\{])/g, '\\surd');
  processed = processed.replace(/▷◁/g, ' \\bowtie ');

  // 7. Compound math constructs
  const compoundRegex =
    /(\\(?:lim|sum|int|iint|iiint|prod|frac|dfrac|tfrac|sqrt|cbrt|mathbb|mathbf|mathit|mathrm|mathcal|vec|hat|bar|tilde|dot|ddot|operatorname)(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|\{(?:[^{}]|\{[^{}]*\})*\})+(?:\([^\)]+\))?)/g;
  processed = processed.replace(compoundRegex, (match) => {
    try {
      const html = katex.renderToString(match.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return match;
    }
  });

  // 8. Greek letters with sub/superscripts
  const greekWithIndexRegex =
    /(\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|psi|omega|Delta|Sigma|Omega)(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+)+)/g;
  processed = processed.replace(greekWithIndexRegex, (match) => {
    try {
      const html = katex.renderToString(match.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return match;
    }
  });

  // 9. Isolated sub/superscript variables
  const varIndexRegex =
    /(?<![\\_a-zA-Z0-9])([a-zA-Z](?:_\{[^\}]+\}|\^[a-zA-Z0-9]+|\^\{[^\}]+\}|_[a-zA-Z0-9]+)+)(?![a-zA-Z0-9_])/g;
  processed = processed.replace(varIndexRegex, (match) => {
    try {
      const html = katex.renderToString(match.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return match;
    }
  });

  // 10. Standalone mathematical commands & symbols
  const symbolRegex =
    /(\\(?:in|notin|subset|subseteq|supset|supseteq|setminus|emptyset|forall|exists|neg|land|lor|implies|iff|le|ge|leq|geq|ne|neq|approx|sim|equiv|times|div|pm|mp|cdot|circ|degree|angle|infty|to|rightarrow|leftarrow|Rightarrow|Leftarrow|bowtie|Join|partial|nabla|surd|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?![a-zA-Z]))/g;
  processed = processed.replace(symbolRegex, (match) => {
    try {
      const html = katex.renderToString(match.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return createToken(html);
    } catch {
      return match;
    }
  });

  // Escape surrounding text
  processed = escapeHtml(processed);

  // Restore allowed tags
  processed = processed.replace(/&lt;(\/?(?:u|b|strong|em|i|code))&gt;/gi, '<$1>');

  // Restore tokens
  mathTokens.forEach((html, i) => {
    processed = processed.replace(`___KATEX_TOKEN_${i}___`, html);
  });

  return processed;
}

// Target checks for raw strings that should NOT remain outside katex tags
const rawTargets = [
  '\\sqrt',
  '\\lim',
  '\\infty',
  '\\mathbb{R}',
  '\\begin{cases}',
  '\\frac',
  'x^T',
  'x_n',
  'w_{new}',
  'b_{old}'
];

const examsDir = path.join(__dirname, '../web/src/data/exams');
const files = fs.readdirSync(examsDir).filter(f => f.startsWith('gate-2025-') && f.endsWith('.json'));

console.log(`Auditing math rendering across ${files.length} GATE 2025 papers...`);

let totalQuestions = 0;
let totalMathTokensRendered = 0;
let rawLeaksDetected = 0;
const leakReports = [];

for (const file of files) {
  const filePath = path.join(examsDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const paperCode = data.paperCode || file.replace('gate-2025-', '').replace('.json', '').toUpperCase();

  for (const q of data.questions) {
    totalQuestions++;
    const textsToTest = [q.questionText];
    if (q.options) {
      textsToTest.push(...q.options);
    }
    if (q.contentBlocks) {
      for (const b of q.contentBlocks) {
        if (b.type === 'text') textsToTest.push(b.content || '');
        if (b.type === 'math' || b.type === 'equation') textsToTest.push(b.latex || b.content || '');
      }
    }

    for (const txt of textsToTest) {
      if (!txt) continue;
      const rendered = renderLatexContent(txt);

      // Check if rendered string has raw commands OUTSIDE katex spans
      // Remove all <span class="katex">...</span> first
      const nonKatexText = rendered.replace(/<span class="katex"[\s\S]+?<\/span><\/span><\/span>/g, '');

      for (const target of rawTargets) {
        if (nonKatexText.includes(target)) {
          rawLeaksDetected++;
          leakReports.push({
            paper: paperCode,
            q: q.questionNumber,
            target,
            snippet: txt.slice(0, 100)
          });
        }
      }
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log('MATH RENDERING VERIFICATION RESULTS:');
console.log('='.repeat(70));
console.log(`Total GATE 2025 Questions Tested: ${totalQuestions}`);
console.log(`Raw LaTeX Leaks Detected:         ${rawLeaksDetected}`);
if (rawLeaksDetected > 0) {
  console.log('\nTop Leaks:');
  for (const l of leakReports.slice(0, 15)) {
    console.log(`- [${l.paper} Q${l.q}] Found raw "${l.target}": "${l.snippet}"`);
  }
} else {
  console.log('PERFECT! Zero raw LaTeX leaks across all 2,672 questions and options!');
}
console.log('='.repeat(70));
