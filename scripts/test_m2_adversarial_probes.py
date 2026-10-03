#!/usr/bin/env python3
"""
scripts/test_m2_adversarial_probes.py

Adversarial Stress Test Suite for Milestone 2:
1. Certified 2D Geometric Classifier Boundary Coordinate Probing
   - x0 = 77.9 pt vs 78.0 pt
   - y0 near ans_y - 5.0 pt (ans_y - 5.1, ans_y - 5.0, ans_y - 4.9)
   - Empty option markers exception guard
   - Tall Option 1 figure with y0 < ans_y
   - Multi-figure series stem safeguard (matrices, analogies)
   - 4-Option dimension clustering under noisy outliers
2. Corpus-wide Single-Ownership Invariant:
   - Assets_stem ∩ Assets_option = ∅
   - Naming convention purity (_diag in stem, _opt_ in option)
3. Corpus-wide Zero OCR Contamination:
   - For all questions with displayMode == 'IMAGE_ONLY', options[i] == ""
   - richOptions[i].text == ""
   - OCR text isolated to richOptions[i].ocrText
4. Question-Specific & Paper-Specific Bypass Detection:
   - AST/Regex scanning for hardcoded bypasses
"""

import os
import sys
import glob
import json
import re
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(REPO_ROOT, 'web', 'src', 'data', 'exams')

class TestClassifierSyntheticProbes(unittest.TestCase):
    """
    Directly tests the 2D Geometric Classifier logic extracted from scripts/universal_chsl_importer.py.
    """
    
    def classify_images(self, q_imgs, ans_pos, q_blocks, col_bound=78.0):
        diag_imgs = []
        opt_imgs = []

        if ans_pos:
            ans_page, ans_y = ans_pos
            # 1. Safe empty marker guard: determine top boundary of option area
            opt_marker_ys = [b['pos'][1] for b in q_blocks if b['pos'][0] == ans_page and b['pos'] >= ans_pos and re.search(r'(?:^|\n)\s*[1-4]\s*\.', b['text'])]
            y_boundary = min([ans_y - 5.0] + opt_marker_ys)

            for img in q_imgs:
                img_page, img_y0 = img['pos']
                r = img['rect']

                if img_page < ans_page:
                    diag_imgs.append(img)
                elif img_page > ans_page:
                    if r['x0'] >= col_bound:
                        opt_imgs.append(img)
                    else:
                        diag_imgs.append(img)
                else:
                    if r['y1'] <= ans_y + 1.0 or (r['y0'] < y_boundary and (r['x0'] < col_bound or r['width'] >= 150)):
                        diag_imgs.append(img)
                    elif r['y0'] >= y_boundary:
                        opt_imgs.append(img)
                    else:
                        if r['width'] >= 150 or r['x0'] < col_bound:
                            diag_imgs.append(img)
                        else:
                            opt_imgs.append(img)
        else:
            diag_imgs = q_imgs
            opt_imgs = []

        diag_imgs.sort(key=lambda img: img['pos'])
        opt_imgs.sort(key=lambda img: img['pos'])

        if len(opt_imgs) > 4:
            real_opts = []
            for img in opt_imgs:
                if img['rect']['y1'] <= (ans_pos[1] + 1.0 if ans_pos else 0) or (img['rect']['y0'] < y_boundary and img['rect']['width'] >= 150):
                    diag_imgs.append(img)
                else:
                    real_opts.append(img)
            opt_imgs = real_opts
            diag_imgs.sort(key=lambda img: img['pos'])
            opt_imgs.sort(key=lambda img: img['pos'])

        return diag_imgs, opt_imgs

    def test_horizontal_boundary_77_9_vs_78_0(self):
        """
        Adversarial probe: x0 = 77.9 pt (just below boundary) vs 78.0 pt (at boundary)
        for borderline coordinates (y0 < y_boundary, y1 > ans_y).
        """
        ans_pos = (0, 615.0)
        q_blocks = [
            {'page': 0, 'pos': (0, 615.0), 'text': 'Ans\n1. Option A\n2. Option B\n3. Option C\n4. Option D'}
        ]
        
        # Borderline candidate at x0 = 77.9 pt: left-aligned element straddling boundary -> diag_imgs
        img_77_9 = {
            'id': 'img_77_9',
            'pos': (0, 609.0),
            'rect': {'x0': 77.9, 'y0': 609.0, 'x1': 177.9, 'y1': 700.0, 'width': 100.0, 'height': 91.0}
        }
        # Borderline candidate at x0 = 78.0 pt: indented tall option figure -> opt_imgs
        img_78_0 = {
            'id': 'img_78_0',
            'pos': (0, 609.0),
            'rect': {'x0': 78.0, 'y0': 609.0, 'x1': 178.0, 'y1': 700.0, 'width': 100.0, 'height': 91.0}
        }

        diags_1, opts_1 = self.classify_images([img_77_9], ans_pos, q_blocks)
        self.assertIn(img_77_9, diags_1, "x0=77.9pt borderline must be treated as left-aligned stem element, not option")
        self.assertNotIn(img_77_9, opts_1)

        diags_2, opts_2 = self.classify_images([img_78_0], ans_pos, q_blocks)
        self.assertIn(img_78_0, opts_2, "x0=78.0pt borderline at column threshold must be classified as tall option")
        self.assertNotIn(img_78_0, diags_2)

    def test_vertical_boundary_y0_near_ans_y_minus_5(self):
        """
        Adversarial probe: y0 near ans_y - 5.0 pt.
        ans_y = 615.0 -> y_boundary = 610.0.
        Test y0 = 609.9 (ans_y - 5.1), y0 = 610.0 (ans_y - 5.0), y0 = 610.1 (ans_y - 4.9).
        Option figure is indented (x0 = 88.0, width = 120.0, height = 100.0, y1 > ans_y + 1).
        """
        ans_pos = (0, 615.0)
        q_blocks = [
            {'page': 0, 'pos': (0, 615.0), 'text': 'Ans'}
        ]

        # Case A: y0 = 610.1 (y0 >= y_boundary) -> direct match in elif
        img_above = {
            'id': 'opt_610_1',
            'pos': (0, 610.1),
            'rect': {'x0': 88.0, 'y0': 610.1, 'x1': 208.0, 'y1': 710.1, 'width': 120.0, 'height': 100.0}
        }
        diags_a, opts_a = self.classify_images([img_above], ans_pos, q_blocks)
        self.assertIn(img_above, opts_a)
        self.assertEqual(len(diags_a), 0)

        # Case B: y0 = 610.0 (exact y_boundary) -> direct match in elif
        img_exact = {
            'id': 'opt_610_0',
            'pos': (0, 610.0),
            'rect': {'x0': 88.0, 'y0': 610.0, 'x1': 208.0, 'y1': 710.0, 'width': 120.0, 'height': 100.0}
        }
        diags_b, opts_b = self.classify_images([img_exact], ans_pos, q_blocks)
        self.assertIn(img_exact, opts_b)
        self.assertEqual(len(diags_b), 0)

        # Case C: y0 = 609.9 (ans_y - 5.1: below y_boundary by 0.1 pt!)
        # Because x0 >= 78.0, y1 > ans_y + 1.0 (709.9 > 616.0), width < 150 -> hits fallback else -> opt_imgs!
        img_below = {
            'id': 'opt_609_9',
            'pos': (0, 609.9),
            'rect': {'x0': 88.0, 'y0': 609.9, 'x1': 208.0, 'y1': 709.9, 'width': 120.0, 'height': 100.0}
        }
        diags_c, opts_c = self.classify_images([img_below], ans_pos, q_blocks)
        self.assertIn(img_below, opts_c, "Tall option 1 figure slightly above y_boundary must be caught by width<150 fallback")
        self.assertEqual(len(diags_c), 0)

    def test_tall_option_1_figure_extreme(self):
        """
        Adversarial probe: Tall Option 1 figure with y0 = 580.0, ans_y = 615.0 (35 pt higher!),
        y1 = 704.0 (> ans_y + 1.0), x0 = 86.0 (indented), width = 124.0.
        Stem diagram is wide (W = 340.0, y0 = 300.0, y1 = 605.0 <= ans_y).
        """
        ans_pos = (0, 615.0)
        q_blocks = [{'page': 0, 'pos': (0, 615.0), 'text': 'Ans'}]

        stem_diag = {
            'id': 'stem_diag',
            'pos': (0, 300.0),
            'rect': {'x0': 57.9, 'y0': 300.0, 'x1': 397.9, 'y1': 605.0, 'width': 340.0, 'height': 305.0}
        }
        tall_opt_1 = {
            'id': 'tall_opt_1',
            'pos': (0, 580.0),
            'rect': {'x0': 86.0, 'y0': 580.0, 'x1': 210.0, 'y1': 704.0, 'width': 124.0, 'height': 124.0}
        }
        opt_2 = {
            'id': 'opt_2',
            'pos': (0, 650.0),
            'rect': {'x0': 86.0, 'y0': 650.0, 'x1': 210.0, 'y1': 774.0, 'width': 124.0, 'height': 124.0}
        }
        opt_3 = {
            'id': 'opt_3',
            'pos': (0, 720.0),
            'rect': {'x0': 86.0, 'y0': 720.0, 'x1': 210.0, 'y1': 844.0, 'width': 124.0, 'height': 124.0}
        }
        opt_4 = {
            'id': 'opt_4',
            'pos': (0, 790.0),
            'rect': {'x0': 86.0, 'y0': 790.0, 'x1': 210.0, 'y1': 914.0, 'width': 124.0, 'height': 124.0}
        }

        all_imgs = [stem_diag, tall_opt_1, opt_2, opt_3, opt_4]
        diags, opts = self.classify_images(all_imgs, ans_pos, q_blocks)

        self.assertEqual(len(diags), 1, f"Expected exactly 1 stem diagram, got {len(diags)}: {[d['id'] for d in diags]}")
        self.assertEqual(diags[0]['id'], 'stem_diag')
        self.assertEqual(len(opts), 4, f"Expected exactly 4 options, got {len(opts)}: {[o['id'] for o in opts]}")
        self.assertEqual([o['id'] for o in opts], ['tall_opt_1', 'opt_2', 'opt_3', 'opt_4'])

    def test_multi_figure_series_safeguard(self):
        """
        Adversarial probe: Question stem contains multiple figures (analogy / matrix series)
        e.g. 3 figures in the problem prompt above 'Ans', plus 4 option figures.
        Stem figures:
          - Fig 1: x0 = 57.9, y0 = 200, y1 = 300, W = 100
          - Fig 2: x0 = 170.0, y0 = 200, y1 = 300, W = 100 (x0 >= 78!)
          - Fig 3: x0 = 280.0, y0 = 200, y1 = 300, W = 100 (x0 >= 78!)
        All stem figures have y1 <= ans_y + 1.0 (since ans_y = 615.0).
        Verify that Fig 2 and Fig 3 are NOT stolen into options!
        """
        ans_pos = (0, 615.0)
        q_blocks = [{'page': 0, 'pos': (0, 615.0), 'text': 'Ans\n1. A\n2. B\n3. C\n4. D'}]

        fig_1 = {'id': 'stem_fig_1', 'pos': (0, 200.0), 'rect': {'x0': 57.9, 'y0': 200.0, 'x1': 157.9, 'y1': 300.0, 'width': 100.0, 'height': 100.0}}
        fig_2 = {'id': 'stem_fig_2', 'pos': (0, 200.0), 'rect': {'x0': 170.0, 'y0': 200.0, 'x1': 270.0, 'y1': 300.0, 'width': 100.0, 'height': 100.0}}
        fig_3 = {'id': 'stem_fig_3', 'pos': (0, 200.0), 'rect': {'x0': 280.0, 'y0': 200.0, 'x1': 380.0, 'y1': 300.0, 'width': 100.0, 'height': 100.0}}

        opt_a = {'id': 'opt_a', 'pos': (0, 630.0), 'rect': {'x0': 88.0, 'y0': 630.0, 'x1': 188.0, 'y1': 730.0, 'width': 100.0, 'height': 100.0}}
        opt_b = {'id': 'opt_b', 'pos': (0, 700.0), 'rect': {'x0': 88.0, 'y0': 700.0, 'x1': 188.0, 'y1': 800.0, 'width': 100.0, 'height': 100.0}}
        opt_c = {'id': 'opt_c', 'pos': (0, 770.0), 'rect': {'x0': 88.0, 'y0': 770.0, 'x1': 188.0, 'y1': 870.0, 'width': 100.0, 'height': 100.0}}
        opt_d = {'id': 'opt_d', 'pos': (0, 840.0), 'rect': {'x0': 88.0, 'y0': 840.0, 'x1': 188.0, 'y1': 940.0, 'width': 100.0, 'height': 100.0}}

        all_imgs = [fig_1, fig_2, fig_3, opt_a, opt_b, opt_c, opt_d]
        diags, opts = self.classify_images(all_imgs, ans_pos, q_blocks)

        self.assertEqual(len(diags), 3, f"Expected all 3 stem figures preserved, got {len(diags)}")
        self.assertEqual([d['id'] for d in diags], ['stem_fig_1', 'stem_fig_2', 'stem_fig_3'])
        self.assertEqual(len(opts), 4, f"Expected 4 options, got {len(opts)}")
        self.assertEqual([o['id'] for o in opts], ['opt_a', 'opt_b', 'opt_c', 'opt_d'])

    def test_empty_option_markers_guard(self):
        """
        Adversarial probe: q_blocks has NO option markers (empty list).
        Must safely evaluate without raising ValueError: min() arg is an empty sequence.
        """
        ans_pos = (0, 615.0)
        q_blocks = [{'page': 0, 'pos': (0, 615.0), 'text': 'Ans'}] # No '1.', '2.', etc.
        opt_a = {'id': 'opt_a', 'pos': (0, 630.0), 'rect': {'x0': 88.0, 'y0': 630.0, 'x1': 188.0, 'y1': 730.0, 'width': 100.0, 'height': 100.0}}

        try:
            diags, opts = self.classify_images([opt_a], ans_pos, q_blocks)
            self.assertEqual(len(opts), 1)
        except ValueError as e:
            self.fail(f"Crashed with ValueError on empty option markers: {e}")

    def test_dimension_clustering_outlier_reclassification(self):
        """
        Adversarial probe: opt_imgs initially contains 5 images (4 matching options + 1 wide header diagram).
        4-option dimension clustering should reclassify the wide image back to diags!
        """
        ans_pos = (0, 615.0)
        q_blocks = [{'page': 0, 'pos': (0, 615.0), 'text': 'Ans'}]

        wide_header = {'id': 'wide_header', 'pos': (0, 611.0), 'rect': {'x0': 80.0, 'y0': 611.0, 'x1': 300.0, 'y1': 614.0, 'width': 220.0, 'height': 3.0}}
        opt_1 = {'id': 'opt_1', 'pos': (0, 620.0), 'rect': {'x0': 88.0, 'y0': 620.0, 'x1': 188.0, 'y1': 720.0, 'width': 100.0, 'height': 100.0}}
        opt_2 = {'id': 'opt_2', 'pos': (0, 700.0), 'rect': {'x0': 88.0, 'y0': 700.0, 'x1': 188.0, 'y1': 800.0, 'width': 100.0, 'height': 100.0}}
        opt_3 = {'id': 'opt_3', 'pos': (0, 780.0), 'rect': {'x0': 88.0, 'y0': 780.0, 'x1': 188.0, 'y1': 880.0, 'width': 100.0, 'height': 100.0}}
        opt_4 = {'id': 'opt_4', 'pos': (0, 860.0), 'rect': {'x0': 88.0, 'y0': 860.0, 'x1': 188.0, 'y1': 960.0, 'width': 100.0, 'height': 100.0}}

        all_imgs = [wide_header, opt_1, opt_2, opt_3, opt_4]
        diags, opts = self.classify_images(all_imgs, ans_pos, q_blocks)

        self.assertIn(wide_header, diags, "Wide header must be filtered to stem diagrams")
        self.assertEqual(len(opts), 4)
        self.assertEqual([o['id'] for o in opts], ['opt_1', 'opt_2', 'opt_3', 'opt_4'])


class TestCorpusEmpiricalAudits(unittest.TestCase):
    """
    Examines all 37 SSC CHSL 2024 JSON files in web/src/data/exams.
    """
    @classmethod
    def setUpClass(cls):
        pattern = os.path.join(DATA_DIR, 'ssc-chsl-2024-*.json')
        cls.files = sorted(glob.glob(pattern))
        cls.papers = {}
        for f in cls.files:
            paper_id = os.path.basename(f).replace('.json', '')
            with open(f, 'r', encoding='utf-8') as jf:
                cls.papers[paper_id] = json.load(jf)

    def test_corpus_count_and_integrity(self):
        """Verify exactly 37 papers exist with expected question counts (100 for T1, 135 for T2)."""
        self.assertEqual(len(self.files), 37, f"Expected 37 papers, found {len(self.files)}")
        total_questions = 0
        for pid, data in self.papers.items():
            qs = data.get('questions', [])
            tier = data.get('tier', 'Tier 1')
            expected = 135 if tier == 'Tier 2' else 100
            self.assertEqual(len(qs), expected, f"Paper {pid} question count mismatch: got {len(qs)}, expected {expected}")
            total_questions += len(qs)
        self.assertEqual(total_questions, 3735, f"Expected 3,735 questions, got {total_questions}")

    def test_single_ownership_invariant_across_corpus(self):
        """
        Verify:
        1. Assets_stem ∩ Assets_option = ∅ for every single question.
        2. Diagram URLs never contain '_opt_'.
        3. Option image URLs never contain '_diag'.
        """
        violations = []
        naming_violations = []

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                diag_urls = set()
                if q.get('diagramUrl'):
                    diag_urls.add(q.get('diagramUrl'))
                if q.get('diagramUrls'):
                    diag_urls.update(q.get('diagramUrls'))
                if q.get('questionAssets'):
                    for qa in q.get('questionAssets'):
                        if isinstance(qa, dict) and qa.get('url'):
                            diag_urls.add(qa.get('url'))

                opt_urls = set()
                if q.get('optionImages'):
                    for u in q.get('optionImages'):
                        if u:
                            opt_urls.add(u)
                if q.get('richOptions'):
                    for ro in q.get('richOptions'):
                        if ro.get('imageUrl'):
                            opt_urls.add(ro.get('imageUrl'))

                overlap = diag_urls.intersection(opt_urls)
                if overlap:
                    violations.append((pid, qnum, overlap))

                for u in diag_urls:
                    if '_opt_' in u:
                        naming_violations.append((pid, qnum, 'stem has _opt_', u))
                for u in opt_urls:
                    if '_diag' in u:
                        naming_violations.append((pid, qnum, 'option has _diag', u))

        self.assertEqual(len(violations), 0, f"Found single-ownership intersections: {violations}")
        self.assertEqual(len(naming_violations), 0, f"Found naming violations: {naming_violations}")

    def test_zero_ocr_contamination_in_image_only(self):
        """
        Verify:
        Whenever an option has displayMode == 'IMAGE_ONLY':
        1. options[i] MUST be strictly "" (empty string)
        2. richOptions[i].text MUST be strictly "" (empty string)
        3. OCR text is quarantined strictly to richOptions[i].ocrText
        """
        contamination_in_options = []
        contamination_in_rich = []

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                options = q.get('options') or []
                rich_options = q.get('richOptions') or []

                for idx, ro in enumerate(rich_options):
                    mode = ro.get('displayMode')
                    if mode == 'IMAGE_ONLY':
                        # Check raw options array
                        raw_opt_val = options[idx] if idx < len(options) else ""
                        if raw_opt_val != "":
                            contamination_in_options.append((pid, qnum, idx, raw_opt_val))

                        # Check richOptions text
                        ro_text = ro.get('text')
                        if ro_text != "":
                            contamination_in_rich.append((pid, qnum, idx, ro_text))

        self.assertEqual(len(contamination_in_options), 0,
                         f"Found {len(contamination_in_options)} OCR contaminations in raw options array: {contamination_in_options[:10]}")
        self.assertEqual(len(contamination_in_rich), 0,
                         f"Found {len(contamination_in_rich)} OCR contaminations in richOptions.text: {contamination_in_rich[:10]}")

    def test_zero_empty_options_across_all_questions(self):
        """
        Verify:
        No question has an option slot where BOTH text is empty AND imageUrl is null.
        Every slot must have a valid presentation asset or text.
        """
        empty_options = []
        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                options = q.get('options') or []
                option_images = q.get('optionImages') or [None, None, None, None]

                for idx in range(4):
                    t = (options[idx] if idx < len(options) else "") or ""
                    img = (option_images[idx] if idx < len(option_images) else None)
                    if not t.strip() and not img:
                        empty_options.append((pid, qnum, idx))

        self.assertEqual(len(empty_options), 0, f"Found {len(empty_options)} unrepresented empty options: {empty_options[:10]}")

    def test_zero_stem_wipes_across_all_questions(self):
        """
        Verify:
        No question has questionText == 'Question {N}'.
        If text is empty, a valid diagram MUST exist.
        """
        stem_wipes = []
        empty_non_visual = []

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                qtext = (q.get('questionText') or '').strip()
                diag = q.get('diagramUrl') or q.get('diagramUrls')

                if re.match(r'^Question\s*\d+$', qtext, re.IGNORECASE):
                    stem_wipes.append((pid, qnum, qtext))
                elif not qtext and not diag:
                    empty_non_visual.append((pid, qnum))

        self.assertEqual(len(stem_wipes), 0, f"Found stem wipes: {stem_wipes}")
        self.assertEqual(len(empty_non_visual), 0, f"Found empty non-visual stems: {empty_non_visual}")

    def test_zero_question_or_paper_specific_bypasses(self):
        """
        Adversarial static analysis:
        Scan scripts and ingestion code for suspicious question-specific or paper-specific bypasses.
        Disallowed patterns:
        - if paper_id == '...' or if paper == '...'
        - if question_number == ... or if q_num == 26 ...
        - hardcoded maps {26: ..., 4: ...}
        """
        suspicious_files = [
            'scripts/universal_chsl_importer.py',
            'scripts/universal_visual_extractor.py',
            'web/src/services/ingestion/pdf/questionSegmenter.ts',
            'web/src/services/ingestion/pdf/optionSegmenter.ts',
            'web/src/services/ingestion/pdf/contentBlockBuilder.ts',
            'web/src/services/ingestion/universal/universalMockGenerator.ts',
            'web/src/services/ingestion/questionMigrator.ts',
        ]

        bypasses = []
        forbidden_regexes = [
            (r'(?:q_num|questionNumber|overall_q_num|q)\s*==\s*(?:4|26|27|30|31|34|37)\b', 'question-specific number comparison'),
            (r'paper_id\s*==\s*[\'"][^\'"]+[\'"]', 'specific paper_id equality check'),
            (r'paperId\s*===\s*[\'"][^\'"]+[\'"]', 'specific paperId equality check'),
        ]

        for rel_path in suspicious_files:
            abs_path = os.path.join(REPO_ROOT, rel_path)
            if not os.path.exists(abs_path):
                continue
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = f.read()

            for regex, desc in forbidden_regexes:
                matches = re.finditer(regex, content)
                for m in matches:
                    bypasses.append((rel_path, m.group(0), desc))

        self.assertEqual(len(bypasses), 0, f"Discovered question-specific or paper-specific bypasses: {bypasses}")


if __name__ == '__main__':
    unittest.main(verbosity=2)
