// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LatexRenderer } from '../../components/LatexRenderer';
import { parseMarkdownContent } from '../../components/StructuredContentRenderer';
import gate2025Da from './gate-2025-da.json';

describe('GATE 2025 DA Forensic Content Fidelity', () => {
  it('should have 65 questions and complete paper metadata', () => {
    expect(gate2025Da.questions.length).toBe(65);
    expect(gate2025Da.paperCode).toBe('DA');
    expect(gate2025Da.editionYear).toBe(2025);
  });

  describe('GATE 2025 DA Q3 (Pixel Matrix Fidelity & Deduplication)', () => {
    const q3 = gate2025Da.questions.find((q: any) => q.questionNumber === 3) as any;

    it('should retain the complete prompt without dropping the first sentence', () => {
      expect(q3).toBeDefined();
      expect(q3.questionText).toContain('A 4 \\times 4 digital image has pixel intensities');
      expect(q3.questionText).toContain('The number of pixels with 𝑈 \\le 4 is:');
    });

    it('should have exactly one visual diagram block in contentBlocks', () => {
      const diagramBlocks = q3.contentBlocks.filter((b: any) => b.type === 'diagram');
      expect(diagramBlocks.length).toBe(1);
      expect(diagramBlocks[0].assetUrl).toBe('/exam-assets/gate/2025/da/q3_diag.png');
    });

    it('should have matching diagramUrl metadata matching the contentBlock', () => {
      expect(q3.diagramUrl).toBe('/exam-assets/gate/2025/da/q3_diag.png');
    });

    it('should have exactly 4 valid options', () => {
      expect(q3.options).toEqual(['3', '8', '11', '9']);
    });
  });

  describe('GATE 2025 DA Q4 (Figure Ownership Model — No Leaked Labels)', () => {
    const q4 = gate2025Da.questions.find((q: any) => q.questionNumber === 4) as any;

    it('should not leak internal figure labels into standalone questionText', () => {
      expect(q4).toBeDefined();
      expect(q4.questionText).not.toContain('2 R');
      expect(q4.questionText).not.toContain('4 Q 1 P');
      expect(q4.questionText).not.toMatch(/^\s*3\s*$/m);
      expect(q4.questionText).toBe(
        'In the given figure, the numbers associated with the rectangle, triangle, and ellipse are 1, 2, and 3, respectively. Which one among the given options is the most appropriate combination of P, Q, and R ?'
      );
    });

    it('should have exactly one diagram block in contentBlocks', () => {
      const diagramBlocks = q4.contentBlocks.filter((b: any) => b.type === 'diagram');
      expect(diagramBlocks.length).toBe(1);
      expect(diagramBlocks[0].assetUrl).toBe('/exam-assets/gate/2025/da/q4_diag.png');
    });

    it('should have exactly 4 valid options', () => {
      expect(q4.options.length).toBe(4);
      expect(q4.options[0]).toBe('P = 6; Q = 5; R = 3');
    });
  });

  describe('GATE 2025 DA Q6 (Structured Table Block vs Garbled Text)', () => {
    const q6 = gate2025Da.questions.find((q: any) => q.questionNumber === 6) as any;

    it('should have a structured table block with Column-I and Column-II', () => {
      expect(q6).toBeDefined();
      const tableBlock = q6.contentBlocks.find((b: any) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock.headers).toEqual(['Column-I', 'Column-II']);
      expect(tableBlock.rows.length).toBe(4);
      expect(tableBlock.rows[0][0]).toContain('P. This house is in a mess.');
      expect(tableBlock.rows[0][1]).toContain("1. Alright, I won't bring it up");
    });

    it('should have 4 distinct matching options', () => {
      expect(q6.options).toEqual([
        'P - 2; Q - 3; R - 1; S - 4',
        'P - 3; Q - 4; R - 1; S - 2',
        'P - 4; Q - 1; R - 2; S - 3',
        'P - 1; Q - 2; R - 4; S - 3'
      ]);
    });
  });

  describe('GATE 2025 DA Q10 (Bar Chart Classification — No Table False Positive)', () => {
    const q10 = gate2025Da.questions.find((q: any) => q.questionNumber === 10) as any;

    it('should classify the bar chart as a diagram, not a table', () => {
      expect(q10).toBeDefined();
      const tableBlock = q10.contentBlocks.find((b: any) => b.type === 'table');
      expect(tableBlock).toBeUndefined();

      const diagramBlock = q10.contentBlocks.find((b: any) => b.type === 'diagram');
      expect(diagramBlock).toBeDefined();
      expect(diagramBlock.assetUrl).toBe('/exam-assets/gate/2025/da/q10_diag.png');
    });

    it('should have full prompt text without chart labels leaked as text', () => {
      expect(q10.questionText).toContain('The number of patients per shift (𝑋) consulting Dr. Gita in her past 100 shifts is shown in the figure.');
      expect(q10.questionText).toContain('Note: The figure shown is representative.');
    });
  });

  describe('GATE 2025 DA Q42 & Q43 (Figure Label Absorption & Mathematical Options)', () => {
    const q42 = gate2025Da.questions.find((q: any) => q.questionNumber === 42) as any;
    const q43 = gate2025Da.questions.find((q: any) => q.questionNumber === 43) as any;

    it('should not leak output node label y into standalone prompt text in Q42', () => {
      expect(q42).toBeDefined();
      expect(q42.questionText).not.toMatch(/\n\s*y\s*\n/);
    });

    it('should reconstruct partial derivative fraction options in Q42', () => {
      expect(q42.options[0]).toContain('\\frac{\\partial y}{\\partial a}');
      expect(q42.options[0]).toContain('\\frac{\\partial y}{\\partial f}');
    });

    it('should absorb MAX, MIN, and Tree titles into the diagram in Q43', () => {
      expect(q43).toBeDefined();
      expect(q43.questionText).not.toMatch(/\bMAX\b\s*\n\s*\bMIN\b/);
      expect(q43.questionText).not.toContain('Tree-1 Tree-2');
    });
  });

  describe('GATE 2025 AE Q6 (Matching Table Structure & Aligned Rows)', () => {
    // Dynamically require gate-2025-ae.json
    const gate2025Ae = require('./gate-2025-ae.json');
    const q6 = gate2025Ae.questions.find((q: any) => q.questionNumber === 6);

    it('should have 65 questions and AE metadata', () => {
      expect(gate2025Ae.questions.length).toBe(65);
      expect(gate2025Ae.paperCode).toBe('AE');
    });

    it('should have authentic structured table block with Column-I and Column-II', () => {
      expect(q6).toBeDefined();
      const tableBlock = q6.contentBlocks.find((b: any) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock.headers).toEqual(['Column-I', 'Column-II']);
      expect(tableBlock.rows.length).toBe(4);
      expect(tableBlock.rows[0][0]).toContain('P. This house is in a mess.');
      expect(tableBlock.rows[0][1]).toContain("1. Alright, I won't bring it up");
      expect(tableBlock.rows[1][0]).toContain('Q. I am not happy with the marks');
      expect(tableBlock.rows[1][1]).toContain('2. Well, you can easily look it up.');
      expect(tableBlock.rows[2][0]).toContain('R. Politics is a subject I avoid');
      expect(tableBlock.rows[2][1]).toContain('3. No problem, let me clear it up');
      expect(tableBlock.rows[3][0]).toContain("S. I don't know what this word");
      expect(tableBlock.rows[3][1]).toContain("4. Don't worry, I will take it up");
    });

    it('should have 4 valid matching options', () => {
      expect(q6.options.length).toBe(4);
      expect(q6.options[0]).toBe('P - 2; Q - 3; R - 1; S - 4');
      expect(q6.options[1]).toBe('P - 3; Q - 4; R - 1; S - 2');
    });

    it('should parse questionText in fallback mode into identical structured table blocks', () => {
      const blocks = parseMarkdownContent(q6.questionText);
      const tableBlock = blocks.find((b: any) => b.type === 'table') as any;
      expect(tableBlock).toBeDefined();
      expect(tableBlock.headers).toEqual(['Column-I', 'Column-II']);
      expect(tableBlock.alignments).toEqual(['left', 'left']);
      expect(tableBlock.rows.length).toBe(4);
      expect(tableBlock.rows[0][0]).toContain('P. This house is in a mess.');
      expect(tableBlock.rows[0][1]).toContain("1. Alright, I won't bring it up");
      expect(tableBlock.rows[1][0]).toContain('Q. I am not happy with the marks');
      expect(tableBlock.rows[1][1]).toContain('2. Well, you can easily look it up.');
      expect(tableBlock.rows[2][0]).toContain('R. Politics is a subject I avoid');
      expect(tableBlock.rows[2][1]).toContain('3. No problem, let me clear it up');
      expect(tableBlock.rows[3][0]).toContain("S. I don't know what this word");
      expect(tableBlock.rows[3][1]).toContain("4. Don't worry, I will take it up");
    });
  });

  describe('GATE 2025 AE Q37 (Symbol Font Greek Character Decoding in Table & Options)', () => {
    const gate2025Ae = require('./gate-2025-ae.json');
    const q37 = gate2025Ae.questions.find((q: any) => q.questionNumber === 37);

    it('should decode Symbol font private-use characters to authentic KaTeX Greek symbols', () => {
      expect(q37).toBeDefined();
      const tableBlock = q37.contentBlocks.find((b: any) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock.headers).toContain('Material \\(\\alpha\\)');
      expect(tableBlock.headers).toContain('Material \\(\\beta\\)');
      expect(tableBlock.headers).toContain('Material \\(\\gamma\\)');
      expect(tableBlock.headers).toContain('Material \\(\\delta\\)');
    });

    it('should decode options to authentic KaTeX Greek symbols', () => {
      expect(q37.options[0]).toBe('Material \\(\\alpha\\)');
      expect(q37.options[1]).toBe('Material \\(\\beta\\)');
      expect(q37.options[2]).toBe('Material \\(\\gamma\\)');
      expect(q37.options[3]).toBe('Material \\(\\delta\\)');
    });
  });

  describe('GATE 2025 AE Q28 (Stress Tensor Math Fidelity & Subscript Tokenization)', () => {
    const gate2025Ae = require('./gate-2025-ae.json');
    const q28 = gate2025Ae.questions.find((q: any) => q.questionNumber === 28);

    it('should retain authentic stress tensor formula prompt text', () => {
      expect(q28).toBeDefined();
      expect(q28.questionText).toContain('𝜎_{𝑥𝑥}= 𝜎_{𝑧𝑧}= 𝐶_{1}𝑦');
      expect(q28.questionText).toContain('𝜎_{𝑦𝑦}= 𝐶_{2}𝑦');
      expect(q28.questionText).toContain('𝜏_{𝑥𝑦}= 𝜏_{𝑦𝑧}= 𝜏_{𝑧𝑥}= 0');
    });

    it('should render all stress tensor components into KaTeX math tokens without literal subscript braces in DOM', () => {
      const { container } = render(<LatexRenderer content={q28.questionText} />);
      const katexElements = container.querySelectorAll('.katex');
      // Must contain math elements for sigma_xx, sigma_zz, C_1, sigma_yy, C_2, tau_xy, tau_yz, tau_zx, C_1, C_2
      expect(katexElements.length).toBeGreaterThanOrEqual(7);

      // Raw subscript strings must not remain as unparsed literal text
      expect(container.textContent).not.toContain('_{xx}');
      expect(container.textContent).not.toContain('_{yy}');
      expect(container.textContent).not.toContain('_{zz}');
      expect(container.textContent).not.toContain('_{xy}');
      expect(container.textContent).not.toContain('_{yz}');
      expect(container.textContent).not.toContain('_{zx}');
      expect(container.textContent).not.toContain('_{1}');
      expect(container.textContent).not.toContain('_{2}');
    });

    it('should cleanly render Option D with authentic prose spacing and math C_{1}', () => {
      const optD = q28.options[3];
      const { container } = render(<LatexRenderer content={optD} />);
      // Should not flatten English words into unspaced math string
      expect(container.textContent).toContain('The direction of the body force per unit volume depends on the value of');
      expect(container.textContent).not.toContain('Thedirectionofthebodyforce');
      expect(container.querySelector('.katex')).not.toBeNull();
    });
  });

  describe('GATE 2025 AE Q39 (Flight Velocity Notation & Option Prose Spacing)', () => {
    const gate2025Ae = require('./gate-2025-ae.json');
    const q39 = gate2025Ae.questions.find((q: any) => q.questionNumber === 39);

    it('should preserve flight velocity notation V_{g} in questionText', () => {
      expect(q39).toBeDefined();
      expect(q39.questionText).toContain('𝑉_{𝑔}');
      const { container } = render(<LatexRenderer content={q39.questionText} />);
      expect(container.querySelector('.katex')).not.toBeNull();
      expect(container.textContent).not.toContain('_{g}');
    });

    it('should render options with proper prose word spacing without flattening', () => {
      for (const opt of q39.options) {
        const { container } = render(<LatexRenderer content={opt} />);
        expect(container.textContent).toMatch(/is equal to the speed|increases with/);
        expect(container.textContent).not.toContain('isequaltothespeed');
        expect(container.textContent).not.toContain('increaseswith');
        expect(container.querySelector('.katex')).not.toBeNull();
      }
    });
  });

  describe('GATE 2024 DA Forensic Content Fidelity', () => {
    const gate2024Da = require('./gate-2024-da.json');

    it('should have 65 questions and complete paper metadata for GATE 2024 DA', () => {
      expect(gate2024Da.questions.length).toBe(65);
      expect(gate2024Da.paperCode).toBe('DA');
      expect(gate2024Da.editionYear).toBe(2024);
      expect(gate2024Da.subTitle).toContain('IISc Bengaluru');
    });

    describe('GATE 2024 DA Q4 (Infinite Mathematical Series Fidelity)', () => {
      const q4 = gate2024Da.questions.find((q: any) => q.questionNumber === 4);

      it('should preserve all 7 fractions without detached denominators', () => {
        expect(q4).toBeDefined();
        expect(q4.questionText).toContain('\\frac{1}{2}');
        expect(q4.questionText).toContain('\\frac{1}{3}');
        expect(q4.questionText).toContain('\\frac{1}{4}');
        expect(q4.questionText).toContain('\\frac{1}{8}');
        expect(q4.questionText).toContain('\\frac{1}{9}');
        expect(q4.questionText).toContain('\\frac{1}{16}');
        expect(q4.questionText).toContain('\\frac{1}{27}');
        expect(q4.questionText).not.toContain('1 4');
        expect(q4.questionText).not.toContain('1 8');
        expect(q4.questionText).not.toContain('1 9');
      });

      it('should have 4 valid fraction options', () => {
        expect(q4.options).toEqual(['11/3', '7/2', '13/4', '9/2']);
      });
    });

    describe('GATE 2024 DA Q9 (Dice Net Visual Single-Ownership)', () => {
      const q9 = gate2024Da.questions.find((q: any) => q.questionNumber === 9);

      it('should have diagramUrl pointing to the 3 dice views', () => {
        expect(q9).toBeDefined();
        expect(q9.diagramUrl).toBe('/exam-assets/gate/2024/da/q9_diag.png');
      });

      it('should have exactly 4 visual option images with single ownership', () => {
        expect(q9.optionImages).toEqual([
          '/exam-assets/gate/2024/da/q9_opt_a.png',
          '/exam-assets/gate/2024/da/q9_opt_b.png',
          '/exam-assets/gate/2024/da/q9_opt_c.png',
          '/exam-assets/gate/2024/da/q9_opt_d.png'
        ]);
        expect(q9.options).toEqual(['', '', '', '']);
      });
    });

    describe('GATE 2024 DA Q16 (Matching Table Structure & Aligned Rows)', () => {
      const q16 = gate2024Da.questions.find((q: any) => q.questionNumber === 16);

      it('should have a structured table block with Column 1 and Column 2', () => {
        expect(q16).toBeDefined();
        const tableBlock = q16.contentBlocks.find((b: any) => b.type === 'table');
        expect(tableBlock).toBeDefined();
        expect(tableBlock.headers).toEqual(['Column 1', 'Column 2']);
        expect(tableBlock.rows.length).toBe(3);
        expect(tableBlock.rows[0]).toEqual(['(p) First In First Out', '(i) Stacks']);
        expect(tableBlock.rows[1]).toEqual(['(q) Lookup Operation', '(ii) Queues']);
        expect(tableBlock.rows[2]).toEqual(['(r) Last In First Out', '(iii) Hash Tables']);
      });

      it('should have 4 distinct matching options', () => {
        expect(q16.options.length).toBe(4);
        expect(q16.options[0]).toBe('(p) - (ii), (q) - (iii), (r) - (i)');
      });

      it('should parse questionText in fallback mode into identical structured table blocks', () => {
        const blocks = parseMarkdownContent(q16.questionText);
        const tableBlock = blocks.find((b: any) => b.type === 'table') as any;
        expect(tableBlock).toBeDefined();
        expect(tableBlock.headers).toEqual(['Column 1', 'Column 2']);
        expect(tableBlock.alignments).toEqual(['left', 'left']);
        expect(tableBlock.rows.length).toBe(3);
        expect(tableBlock.rows[0]).toEqual(['(p) First In First Out', '(i) Stacks']);
        expect(tableBlock.rows[1]).toEqual(['(q) Lookup Operation', '(ii) Queues']);
        expect(tableBlock.rows[2]).toEqual(['(r) Last In First Out', '(iii) Hash Tables']);
      });
    });

    describe('GATE 2024 DA Q38 & Q41 (Python Code Block Preservation & Indentation)', () => {
      const q38 = gate2024Da.questions.find((q: any) => q.questionNumber === 38);
      const q41 = gate2024Da.questions.find((q: any) => q.questionNumber === 41);

      it('should preserve Q38 Python function with intro, code block, and outro', () => {
        expect(q38).toBeDefined();
        const codeBlock = q38.contentBlocks.find((b: any) => b.type === 'pseudocode');
        expect(codeBlock).toBeDefined();
        expect(codeBlock.content).toContain('def count(child_dict, i):');
        expect(codeBlock.content).toContain('    if i not in child_dict.keys():');
        expect(q38.questionText).toContain('Consider the following Python code:');
        expect(q38.questionText).toContain('Which ONE of the following is the output of this code?');
        expect(q38.options).toEqual(['6', '1', '8', '9']);
      });

      it('should preserve Q41 Python function with recursive definition and outro', () => {
        expect(q41).toBeDefined();
        const codeBlock = q41.contentBlocks.find((b: any) => b.type === 'pseudocode');
        expect(codeBlock).toBeDefined();
        expect(codeBlock.content).toContain('def fun(D, s1, s2):');
        expect(q41.questionText).toContain('Consider the following Python function:');
        expect(q41.questionText).toContain('What does this Python function fun() do?');
        expect(q41.options.length).toBe(4);
      });
    });

    describe('GATE 2024 DA Q55 (Relational Database Schema, SQL Query & Option Integrity)', () => {
      const q55 = gate2024Da.questions.find((q: any) => q.questionNumber === 55);

      it('should preserve complete schema definitions and SQL query in prompt', () => {
        expect(q55).toBeDefined();
        expect(q55.questionText).toContain('An OTT company is maintaining a large disk-based relational database');
        expect(q55.questionText).toContain('Movie(ID, CustomerRating)');
        expect(q55.questionText).toContain('Genre(ID, Name)');
        expect(q55.questionText).toContain('SELECT * FROM Movie, Genre, Movie_Genre');
        expect(q55.questionText).toContain('This SQL query can be sped up using which of the following indexing options?');
      });

      it('should have 4 non-empty options with B+ tree and Hash index', () => {
        expect(q55.options.length).toBe(4);
        expect(q55.options[0]).toBe('B+ tree on all the attributes.');
        expect(q55.options[1]).toContain('Hash index on Genre.Name');
        expect(q55.options[2]).toContain('Hash index on Movie.CustomerRating');
        expect(q55.options[3]).toContain('Hash index on all the attributes');
      });
    });
  });

  describe('KaTeX Unicode Math Glyphs Normalization', () => {
    it('should correctly render ratio symbol ∶ (8758) as colon without warnings', () => {
      const { container } = render(<LatexRenderer content="AD ∶ DB = 9 ∶ 8" />);
      expect(container.textContent).toContain('AD : DB = 9 : 8');
    });

    it('should correctly render perpendicular symbol ⊥ (8869) as KaTeX perp', () => {
      const { container } = render(<LatexRenderer content="Line AB ⊥ Line CD and S^{⊥}" />);
      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).not.toContain('\\perp');
    });

    it('should correctly render norm / double vertical bar ‖ (8214) as KaTeX Vert', () => {
      const { container } = render(<LatexRenderer content="Euclidean norm ‖w‖ = 1" />);
      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).not.toContain('\\Vert');
    });

    it('should correctly render reduced Planck constant ħ (295) with exponents', () => {
      const { container } = render(<LatexRenderer content="Eigenvalue 30ħ^{2}" />);
      expect(container.querySelector('.katex')).not.toBeNull();
      expect(container.textContent).not.toContain('ħ');
      expect(container.textContent).not.toContain('^{2}');
    });

    it('should correctly render increment delta ∆ (8710) as KaTeX Delta', () => {
      const { container } = render(<LatexRenderer content="Pressure drop ∆P and head loss ∆h" />);
      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).not.toContain('∆');
    });

    it('should correctly render fraction slash ⁄ (8260) as division slash', () => {
      const { container } = render(<LatexRenderer content="Ratio 1 ⁄ 2 and feed ratio r_1 ⁄ r_2" />);
      expect(container.textContent).toContain('1 / 2');
      expect(container.textContent).not.toContain('⁄');
    });
  });

  describe('GATE 2024 Corrupted Questions Restoration (Authentic Question Stems)', () => {
    it('should restore CS-1 Q21 B+ tree question from official PDF', () => {
      const gate2024Cs1 = require('./gate-2024-cs-1.json');
      const q21 = gate2024Cs1.questions.find((q: any) => q.questionNumber === 21);
      expect(q21).toBeDefined();
      expect(q21.questionText).toContain('In a B+ tree, the requirement of at least half-full (50%) node occupancy is relaxed');
      expect(q21.questionText).not.toContain('continuous random variable');
      expect(q21.options[0]).toBe('Only the root node');
      expect(q21.options[3]).toBe('Only the leftmost leaf node');
    });

    it('should restore CE-1 Q30 doubly-reinforced section question from official PDF', () => {
      const gate2024Ce1 = require('./gate-2024-ce-1.json');
      const q30 = gate2024Ce1.questions.find((q: any) => q.questionNumber === 30);
      expect(q30).toBeDefined();
      expect(q30.questionText).toContain('Consider a balanced doubly-reinforced concrete section.');
      expect(q30.questionText).toContain('section becomes under-reinforced?');
      expect(q30.questionText).not.toContain('continuous random variable');
      expect(q30.options[0]).toBe('Area of tension reinforcement is increased.');
    });

    it('should restore ME Q61 cube-shaped mold solidification question from official PDF', () => {
      const gate2024Me = require('./gate-2024-me.json');
      const q61 = gate2024Me.questions.find((q: any) => q.questionNumber === 61);
      expect(q61).toBeDefined();
      expect(q61.questionText).toContain('Aluminium is casted in a cube-shaped mold having dimensions as 20 mm × 20 mm × 20 mm.');
      expect(q61.questionText).toContain('ratio of the solidification times');
      expect(q61.questionText).not.toContain('continuous random variable');
    });

    it('should restore XE Q101 Carnot engine efficiency question from official PDF', () => {
      const gate2024Xe = require('./gate-2024-xe.json');
      const q101 = gate2024Xe.questions.find((q: any) => q.questionNumber === 101);
      expect(q101).toBeDefined();
      expect(q101.questionText).toContain('A Carnot engine operates between two temperatures');
      expect(q101.questionText).toContain('highest increase in efficiency?');
      expect(q101.questionText).not.toContain('continuous random variable');
      expect(q101.options[0]).toContain('Increasing T1 by ∆T');
    });

    it('should restore MA Q47, Q54, and Q62 questions from official PDF', () => {
      const gate2024Ma = require('./gate-2024-ma.json');
      const q47 = gate2024Ma.questions.find((q: any) => q.questionNumber === 47);
      const q54 = gate2024Ma.questions.find((q: any) => q.questionNumber === 54);
      const q62 = gate2024Ma.questions.find((q: any) => q.questionNumber === 62);

      expect(q47.questionText).toContain('continuous linear functional');
      expect(q47.questionText).not.toContain('continuous random variable');
      expect(q47.options[0]).toBe('Both I and II are TRUE');

      expect(q54.questionText).toContain('Let \\(f : \\mathbb{R}^2 \\to \\mathbb{R}\\) be a function such that');
      expect(q54.questionText).toContain('1 - \\cos(x^2)');
      expect(q54.options[0]).toContain('f is continuous at (0, 0)');

      expect(q62.questionText).toContain('initial value problem');
      expect(q62.questionText).toContain('\\frac{\\partial^2 u}{\\partial t^2}');
      expect(q62.questionText).toContain('x^4(1 - x)^4');
    });
  });

  describe('Visual Asset Harvester & Option Image Relinking Integrity', () => {
    it('should have relinked option images for GATE 2025 EC Q5', () => {
      const gate2025Ec = require('./gate-2025-ec.json');
      const q5 = gate2025Ec.questions.find((q: any) => q.questionNumber === 5);
      expect(q5).toBeDefined();
      expect(q5.optionImages).toBeDefined();
      expect(q5.optionImages[0]).toBe('/exam-assets/gate/2025/ec/q5_opt_a.png');
      expect(q5.optionImages[3]).toBe('/exam-assets/gate/2025/ec/q5_opt_d.png');
    });

    it('should have relinked option images for GATE 2024 AE Q25', () => {
      const gate2024Ae = require('./gate-2024-ae.json');
      const q25 = gate2024Ae.questions.find((q: any) => q.questionNumber === 25);
      expect(q25).toBeDefined();
      expect(q25.optionImages).toBeDefined();
      expect(q25.optionImages[0]).toBe('/exam-assets/gate/2024/ae/q25_opt_a.png');
      expect(q25.optionImages[3]).toBe('/exam-assets/gate/2024/ae/q25_opt_d.png');
    });

    it('should have relinked diagram image for GATE 2024 EC Q13', () => {
      const gate2024Ec = require('./gate-2024-ec.json');
      const q13 = gate2024Ec.questions.find((q: any) => q.questionNumber === 13);
      expect(q13).toBeDefined();
      expect(q13.diagramUrl).toBe('/exam-assets/gate/2024/ec/q13_diag.png');
    });
  });
});

