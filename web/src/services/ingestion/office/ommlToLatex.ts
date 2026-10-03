/**
 * Converts Office Math Markup Language (OMML) XML to standard LaTeX syntax.
 * Preserves fractions, exponents, subscripts, radicals, operators, delimiters, and matrices.
 */

const SYMBOL_MAP: Record<string, string> = {
  '±': '\\pm',
  '∓': '\\mp',
  '×': '\\times',
  '÷': '\\div',
  '·': '\\cdot',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∅': '\\emptyset',
  '∞': '\\infty',
  '→': '\\to',
  '⇒': '\\implies',
  '⇔': '\\iff',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'σ': '\\sigma',
  'τ': '\\tau',
  'φ': '\\phi',
  'ω': '\\omega',
  'Γ': '\\Gamma',
  'Δ': '\\Delta',
  'Θ': '\\Theta',
  'Λ': '\\Lambda',
  'Σ': '\\Sigma',
  'Φ': '\\Phi',
  'Ω': '\\Omega',
  '∑': '\\sum',
  '∏': '\\prod',
  '∫': '\\int',
  '√': '\\sqrt',
  '∂': '\\partial',
  '∇': '\\nabla',
};

/**
 * Parses an OMML XML string or Element node into LaTeX string.
 */
export function ommlToLatex(ommlNodeOrXml: string | Element): string {
  let rootNode: Element | null = null;

  if (typeof ommlNodeOrXml === 'string') {
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(ommlNodeOrXml, 'text/xml');
      rootNode = doc.documentElement;
    } else {
      return fallbackOmmlRegex(ommlNodeOrXml);
    }
  } else {
    rootNode = ommlNodeOrXml;
  }

  if (!rootNode) return '';
  const latex = parseNode(rootNode).trim();
  return latex ? `$${latex}$` : '';
}

/**
 * Recursively parses OMML XML DOM elements into LaTeX.
 */
function parseNode(node: Node): string {
  if (node.nodeType === 3) {
    // Text node
    return mapSymbols(node.nodeValue || '');
  }

  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const localName = (el.localName || el.nodeName).replace(/^m:/, '');

  switch (localName) {
    case 'oMathPara':
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg': {
      let result = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        result += parseNode(el.childNodes[i]);
      }
      return result;
    }

    case 'f': {
      // Fraction: \frac{num}{den}
      const numEl = getChildByLocalName(el, 'num');
      const denEl = getChildByLocalName(el, 'den');
      const num = numEl ? parseNode(numEl) : '';
      const den = denEl ? parseNode(denEl) : '';
      return `\\frac{${num}}{${den}}`;
    }

    case 'sSup': {
      // Superscript: {base}^{sup}
      const baseEl = getChildByLocalName(el, 'e');
      const supEl = getChildByLocalName(el, 'sup');
      const base = baseEl ? parseNode(baseEl) : '';
      const sup = supEl ? parseNode(supEl) : '';
      return `{${base}}^{${sup}}`;
    }

    case 'sSub': {
      // Subscript: {base}_{sub}
      const baseEl = getChildByLocalName(el, 'e');
      const subEl = getChildByLocalName(el, 'sub');
      const base = baseEl ? parseNode(baseEl) : '';
      const sub = subEl ? parseNode(subEl) : '';
      return `{${base}}_{${sub}}`;
    }

    case 'sSubSup': {
      // Subscript and Superscript: {base}_{sub}^{sup}
      const baseEl = getChildByLocalName(el, 'e');
      const subEl = getChildByLocalName(el, 'sub');
      const supEl = getChildByLocalName(el, 'sup');
      const base = baseEl ? parseNode(baseEl) : '';
      const sub = subEl ? parseNode(subEl) : '';
      const sup = supEl ? parseNode(supEl) : '';
      return `{${base}}_{${sub}}^{${sup}}`;
    }

    case 'rad': {
      // Radical: \sqrt[deg]{base}
      const baseEl = getChildByLocalName(el, 'e');
      const degEl = getChildByLocalName(el, 'deg');
      const base = baseEl ? parseNode(baseEl) : '';
      const deg = degEl ? parseNode(degEl).trim() : '';
      return deg ? `\\sqrt[${deg}]{${base}}` : `\\sqrt{${base}}`;
    }

    case 'd': {
      // Delimiters (brackets, parentheses)
      const dPr = getChildByLocalName(el, 'dPr');
      let beg = '(';
      let end = ')';
      if (dPr) {
        const begEl = getChildByLocalName(dPr, 'begChr');
        const endEl = getChildByLocalName(dPr, 'endChr');
        if (begEl) beg = begEl.getAttribute('m:val') || begEl.getAttribute('val') || beg;
        if (endEl) end = endEl.getAttribute('m:val') || endEl.getAttribute('val') || end;
      }
      const contentEl = getChildByLocalName(el, 'e');
      const content = contentEl ? parseNode(contentEl) : '';
      const leftToken = beg === '{' ? '\\left\\{' : `\\left${beg}`;
      const rightToken = end === '}' ? '\\right\\}' : `\\right${end}`;
      return `${leftToken} ${content} ${rightToken}`;
    }

    case 'nary': {
      // N-ary operator: \sum_{sub}^{sup}{e}
      const naryPr = getChildByLocalName(el, 'naryPr');
      let op = '\\sum';
      if (naryPr) {
        const chrEl = getChildByLocalName(naryPr, 'chr');
        const chr = chrEl?.getAttribute('m:val') || chrEl?.getAttribute('val');
        if (chr && SYMBOL_MAP[chr]) {
          op = SYMBOL_MAP[chr];
        }
      }
      const subEl = getChildByLocalName(el, 'sub');
      const supEl = getChildByLocalName(el, 'sup');
      const contentEl = getChildByLocalName(el, 'e');
      const sub = subEl ? parseNode(subEl).trim() : '';
      const sup = supEl ? parseNode(supEl).trim() : '';
      const content = contentEl ? parseNode(contentEl) : '';

      let opStr = op;
      if (sub) opStr += `_{${sub}}`;
      if (sup) opStr += `^{${sup}}`;
      return `${opStr} ${content}`;
    }

    case 'm': {
      // Matrix: \begin{matrix} ... \end{matrix}
      const rows: string[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i] as Element;
        const name = (child.localName || child.nodeName || '').replace(/^m:/, '');
        if (name === 'mr') {
          // Matrix row
          const cells: string[] = [];
          for (let j = 0; j < child.childNodes.length; j++) {
            const cell = child.childNodes[j] as Element;
            const cellName = (cell.localName || cell.nodeName || '').replace(/^m:/, '');
            if (cellName === 'e') {
              cells.push(parseNode(cell));
            }
          }
          rows.push(cells.join(' & '));
        }
      }
      return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
    }

    case 'bar': {
      const contentEl = getChildByLocalName(el, 'e');
      return `\\overline{${contentEl ? parseNode(contentEl) : ''}}`;
    }

    case 't': {
      // Text node
      return mapSymbols(el.textContent || '');
    }

    case 'r': {
      // Math run
      let rText = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        rText += parseNode(el.childNodes[i]);
      }
      return rText;
    }

    default: {
      let fallback = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        fallback += parseNode(el.childNodes[i]);
      }
      return fallback;
    }
  }
}

function getChildByLocalName(parent: Element, name: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const local = (child.localName || child.nodeName).replace(/^m:/, '');
    if (local === name) return child;
  }
  return null;
}

function mapSymbols(text: string): string {
  let mapped = text;
  for (const [sym, latex] of Object.entries(SYMBOL_MAP)) {
    if (mapped.includes(sym)) {
      mapped = mapped.split(sym).join(` ${latex} `);
    }
  }
  return mapped;
}

/**
 * Fallback regex extractor if DOMParser is unavailable
 */
function fallbackOmmlRegex(xml: string): string {
  const matches = xml.match(/<m:t[^>]*>([^<]+)<\/m:t>/gi);
  if (!matches) return '';
  const text = matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ');
  return `$${text}$`;
}
