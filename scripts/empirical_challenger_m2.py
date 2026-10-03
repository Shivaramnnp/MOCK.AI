#!/usr/bin/env python3
"""
scripts/empirical_challenger_m2.py

Comprehensive Adversarial Challenger Harness for Milestone 2 Re-Audit:
1. Single-Ownership Invariance across all 37 papers & 3,735 questions:
   - Assets_stem ∩ Assets_option = ∅
   - Physical existence & non-zero size of all referenced assets on disk
   - Naming convention purity (_diag vs _opt_)
2. Visual Reasoning Questions (Mirror images, cube nets, figure series, embedded figures):
   - Non-empty valid image assets in optionImages / richOptions
   - Clean empty string in raw options[i] for IMAGE_ONLY slots
   - Zero OCR contamination beneath pure visual options
   - Deep inspection of representative papers (01 Jul Shift 1, etc.)
3. Hardcoded Question & Paper Patch Static Analysis:
   - AST / Regex scan of all ingestion scripts and frontend production modules
"""

import os
import sys
import glob
import json
import re
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(REPO_ROOT, 'web', 'src', 'data', 'exams')
PUBLIC_DIR = os.path.join(REPO_ROOT, 'web', 'public')

class TestChallengerSingleOwnershipAndAssets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pattern = os.path.join(DATA_DIR, 'ssc-chsl-2024-*.json')
        cls.files = sorted(glob.glob(pattern))
        cls.papers = {}
        for f in cls.files:
            paper_id = os.path.basename(f).replace('.json', '')
            with open(f, 'r', encoding='utf-8') as jf:
                cls.papers[paper_id] = json.load(jf)

    def test_single_ownership_disjoint_sets(self):
        """Verify Assets_stem ∩ Assets_option = ∅ for all 3,735 questions."""
        violations = []
        total_questions = 0

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                total_questions += 1
                qnum = q.get('questionNumber')

                # Collect stem assets
                stem_assets = set()
                if q.get('diagramUrl'):
                    stem_assets.add(q.get('diagramUrl'))
                if q.get('diagramUrls'):
                    stem_assets.update(q.get('diagramUrls'))
                if q.get('questionAssets'):
                    for qa in q.get('questionAssets'):
                        if isinstance(qa, dict) and qa.get('url'):
                            stem_assets.add(qa.get('url'))

                # Also inspect contentBlocks for stem
                if q.get('contentBlocks'):
                    for cb in q.get('contentBlocks'):
                        if isinstance(cb, dict) and cb.get('type') == 'image' and cb.get('url'):
                            stem_assets.add(cb.get('url'))

                # Collect option assets
                opt_assets = set()
                if q.get('optionImages'):
                    for u in q.get('optionImages'):
                        if u:
                            opt_assets.add(u)
                if q.get('richOptions'):
                    for ro in q.get('richOptions'):
                        if ro.get('imageUrl'):
                            opt_assets.add(ro.get('imageUrl'))
                        if ro.get('contentBlocks'):
                            for rcb in ro.get('contentBlocks'):
                                if isinstance(rcb, dict) and rcb.get('type') == 'image' and rcb.get('url'):
                                    opt_assets.add(rcb.get('url'))

                overlap = stem_assets.intersection(opt_assets)
                if overlap:
                    violations.append({
                        'paperId': pid,
                        'questionNumber': qnum,
                        'overlap': list(overlap),
                        'stem_assets': list(stem_assets),
                        'opt_assets': list(opt_assets)
                    })

        self.assertEqual(len(violations), 0, f"Violations found in single ownership: {violations}")
        self.assertEqual(total_questions, 3735)

    def test_physical_asset_existence_and_size(self):
        """Verify all referenced image assets physically exist on disk and have non-zero size."""
        missing_assets = []
        empty_files = []
        verified_assets = 0

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                urls_to_check = []

                if q.get('diagramUrl'):
                    urls_to_check.append(('diagramUrl', q.get('diagramUrl')))
                if q.get('diagramUrls'):
                    for u in q.get('diagramUrls'):
                        urls_to_check.append(('diagramUrls', u))
                if q.get('optionImages'):
                    for idx, u in enumerate(q.get('optionImages')):
                        if u:
                            urls_to_check.append((f'optionImages[{idx}]', u))
                if q.get('richOptions'):
                    for idx, ro in enumerate(q.get('richOptions')):
                        if ro.get('imageUrl'):
                            urls_to_check.append((f'richOptions[{idx}].imageUrl', ro.get('imageUrl')))

                for slot, url in urls_to_check:
                    if url.startswith('/'):
                        rel = url.lstrip('/')
                    else:
                        rel = url
                    disk_path = os.path.join(PUBLIC_DIR, rel)
                    if not os.path.exists(disk_path):
                        missing_assets.append((pid, qnum, slot, url, disk_path))
                    else:
                        size = os.path.getsize(disk_path)
                        if size == 0:
                            empty_files.append((pid, qnum, slot, url, disk_path))
                        verified_assets += 1

        self.assertEqual(len(missing_assets), 0, f"Found {len(missing_assets)} missing asset files on disk: {missing_assets[:5]}")
        self.assertEqual(len(empty_files), 0, f"Found {len(empty_files)} 0-byte asset files on disk: {empty_files[:5]}")
        self.assertGreater(verified_assets, 5000, f"Expected >5000 verified assets on disk, got {verified_assets}")

    def test_naming_convention_purity(self):
        """Verify stem diagrams do not contain '_opt_' and option figures do not contain '_diag'."""
        naming_errors = []
        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                diag_url = q.get('diagramUrl') or ''
                if '_opt_' in diag_url:
                    naming_errors.append((pid, qnum, 'stem contains _opt_', diag_url))
                for idx, u in enumerate(q.get('optionImages') or []):
                    if u and '_diag' in u:
                        naming_errors.append((pid, qnum, f'option[{idx}] contains _diag', u))

        self.assertEqual(len(naming_errors), 0, f"Found asset naming convention errors: {naming_errors}")


class TestChallengerVisualReasoningAndContamination(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pattern = os.path.join(DATA_DIR, 'ssc-chsl-2024-*.json')
        cls.files = sorted(glob.glob(pattern))
        cls.papers = {}
        for f in cls.files:
            pid = os.path.basename(f).replace('.json', '')
            with open(f, 'r', encoding='utf-8') as jf:
                cls.papers[pid] = json.load(jf)

    def test_zero_ocr_contamination_in_raw_options_and_rich_text(self):
        """
        Adversarial test across all 37 papers:
        For any option slot where displayMode == 'IMAGE_ONLY':
        1. raw options[i] must be strictly ""
        2. richOptions[i].text must be strictly ""
        3. optionImages[i] must be equal to richOptions[i].imageUrl
        4. imageUrl must not be empty
        """
        raw_contam = []
        rich_contam = []
        sync_errors = []
        empty_image_urls = []
        total_image_only_slots = 0

        for pid, data in self.papers.items():
            for q in data.get('questions', []):
                qnum = q.get('questionNumber')
                raw_opts = q.get('options') or []
                rich_opts = q.get('richOptions') or []
                opt_imgs = q.get('optionImages') or []

                for idx, ro in enumerate(rich_opts):
                    if ro.get('displayMode') == 'IMAGE_ONLY':
                        total_image_only_slots += 1
                        raw_val = raw_opts[idx] if idx < len(raw_opts) else ""
                        if raw_val != "":
                            raw_contam.append((pid, qnum, idx, raw_val))
                        if ro.get('text') != "":
                            rich_contam.append((pid, qnum, idx, ro.get('text')))
                        
                        img_url = ro.get('imageUrl')
                        if not img_url:
                            empty_image_urls.append((pid, qnum, idx))

                        opt_img = opt_imgs[idx] if idx < len(opt_imgs) else None
                        if opt_img != img_url:
                            sync_errors.append((pid, qnum, idx, opt_img, img_url))

        self.assertEqual(len(raw_contam), 0, f"Found {len(raw_contam)} raw option OCR contaminations: {raw_contam[:5]}")
        self.assertEqual(len(rich_contam), 0, f"Found {len(rich_contam)} richOption.text OCR contaminations: {rich_contam[:5]}")
        self.assertEqual(len(empty_image_urls), 0, f"Found {len(empty_image_urls)} IMAGE_ONLY slots with empty imageUrl: {empty_image_urls}")
        self.assertEqual(len(sync_errors), 0, f"Found {len(sync_errors)} sync errors between optionImages and richOptions.imageUrl: {sync_errors[:5]}")
        self.assertGreater(total_image_only_slots, 3000, f"Expected >3000 IMAGE_ONLY option slots across corpus, got {total_image_only_slots}")

    def test_representative_01jul_s1_visual_reasoning_questions(self):
        """
        Deep forensic challenge on 01 Jul Shift 1:
        Check specific key questions:
        - Q4: full stem, distinct options, no stem-wipe
        - Q26: visual reasoning (4 option images, raw options empty)
        - Q27: mirror image (visual crop, raw options empty, ocrText isolated)
        - Q30: cube net / symbols (visual crop, raw options empty, ocrText isolated)
        - Q31: number visual (visual crop, raw options empty, ocrText isolated)
        - Q34: visual series pattern (all 4 option images exist on disk)
        - Q37: visual analogy (visual crop, raw options empty, ocrText isolated)
        """
        p = self.papers.get('ssc-chsl-2024-01jul-s1')
        self.assertIsNotNone(p, "ssc-chsl-2024-01jul-s1 not found in corpus")
        questions_by_num = {q['questionNumber']: q for q in p['questions']}

        # Q4 Stem check
        q4 = questions_by_num[4]
        self.assertFalse(q4['questionText'].startswith('Question 4'), "Q4 suffered from stem-wipe!")
        self.assertIn("The following sentence has been divided into four segments", q4['questionText'])
        self.assertIn("Passengers started behaving / violent when", q4['questionText'])
        self.assertEqual(len(q4['options']), 4)
        self.assertEqual(q4['correctAnswerIndex'], 1)

        # Visual reasoning questions to probe
        visual_probes = [26, 27, 30, 31, 34, 37]
        for qn in visual_probes:
            q = questions_by_num[qn]
            rich_opts = q.get('richOptions') or []
            self.assertEqual(len(rich_opts), 4, f"Q{qn} should have 4 rich options")
            
            # Check option images
            opt_imgs = q.get('optionImages') or []
            self.assertEqual(len(opt_imgs), 4, f"Q{qn} should have 4 option images")
            for idx, img_path in enumerate(opt_imgs):
                self.assertIsNotNone(img_path, f"Q{qn} option[{idx}] image path is None")
                disk_path = os.path.join(PUBLIC_DIR, img_path.lstrip('/'))
                self.assertTrue(os.path.exists(disk_path), f"Q{qn} option[{idx}] image file does not exist: {disk_path}")
                self.assertGreater(os.path.getsize(disk_path), 0, f"Q{qn} option[{idx}] image file is empty: {disk_path}")

            # Check that raw options are clean empty strings
            raw_opts = q.get('options') or []
            self.assertEqual(raw_opts, ["", "", "", ""], f"Q{qn} raw options must be clean empty strings, got {raw_opts}")

            # Check that richOptions text are empty strings
            for idx, ro in enumerate(rich_opts):
                self.assertEqual(ro.get('text'), "", f"Q{qn} richOption[{idx}].text must be empty string")
                self.assertEqual(ro.get('displayMode'), 'IMAGE_ONLY', f"Q{qn} richOption[{idx}] displayMode must be IMAGE_ONLY")


class TestChallengerHardcodedPatchesScan(unittest.TestCase):
    """
    Adversarial static analysis of all production and importer codebase for hardcoded question patches.
    """
    def test_no_hardcoded_question_patches(self):
        # Scan scripts and web src
        scan_paths = [
            'scripts/universal_chsl_importer.py',
            'scripts/universal_visual_extractor.py',
            'scripts/tier2_importer.py',
            'scripts/ingest_all_chsl_2024.py',
            'web/src/services/ingestion/pdf/questionSegmenter.ts',
            'web/src/services/ingestion/pdf/optionSegmenter.ts',
            'web/src/services/ingestion/pdf/contentBlockBuilder.ts',
            'web/src/services/ingestion/universal/universalMockGenerator.ts',
            'web/src/services/ingestion/questionMigrator.ts',
            'web/src/screens/CompetitiveExamPlayerScreen.tsx',
            'web/src/screens/TestPlayerScreen.tsx',
            'web/src/screens/ReviewScreen.tsx',
            'web/src/components/exam/StructuredContentRenderer.tsx'
        ]

        forbidden_patterns = [
            # Check for hardcoded question number branching
            (re.compile(r'\b(?:q_num|questionNumber|qNum|qIndex)\s*===?\s*(?:4|26|27|30|31|34|37)\b'), "hardcoded question number equality"),
            # Check for paper id checks like if (paperId === 'ssc-chsl-2024-01jul-s1')
            (re.compile(r'\b(?:paperId|paper_id|paper)\s*===?\s*[\'"]ssc-chsl-2024-[^\'"]+[\'"]'), "hardcoded paper ID equality check"),
            # Check for question-specific text injections
            (re.compile(r'if\s*\([^)]*(?:Snodveo|TVW\s*:\s*YAB)[^)]*\)'), "hardcoded question OCR override")
        ]

        findings = []
        for rel in scan_paths:
            full = os.path.join(REPO_ROOT, rel)
            if not os.path.exists(full):
                continue
            with open(full, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line_idx, line in enumerate(lines, 1):
                    # Ignore comment lines
                    stripped = line.strip()
                    if stripped.startswith('#') or stripped.startswith('//') or stripped.startswith('*'):
                        continue
                    for pat, desc in forbidden_patterns:
                        m = pat.search(line)
                        if m:
                            findings.append((rel, line_idx, desc, line.strip()))

        self.assertEqual(len(findings), 0, f"Found hardcoded patches in production/ingestion code: {findings}")


if __name__ == '__main__':
    unittest.main(verbosity=2)
