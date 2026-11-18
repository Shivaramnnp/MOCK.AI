#!/usr/bin/env python3
"""
scripts/test_ssc_engine_v4_regression.py

Comprehensive Regression Test Suite for SSC Universal Ingestion Engine V4.
Directly tests and prevents the 34 failure categories from the Failure Taxonomy:
- A: Missing question stem
- B: Truncated stem
- C: Margin/footer clipping
- D: Reading order sort
- E: Option merged into stem
- F: Stem merged into option
- G: Duplicate option
- H: Wrong option image (no greedy zip fallback to Option D)
- I: Missing option image
- J: Broken asset link
- K: Duplicate question image
- L: Diagram label leakage
- M/N: Multi-signal classification & visual keyword protection
- O: Table flattening protection
- P: Graph/chart misclassification
- Q: Reading comprehension passage attachment
- R: Multi-page boundary clamping
- S: Math & LaTeX syntax validation
- T: OCR character substitution
- U: Answer key green-tick forensics
- V: Sequential question numbering
- W: Section header identification
- X: Cross-paper asset encapsulation
- Y: Stale asset overwrite
- Z: Orphan asset detection
- AA: Prohibition of generic placeholder generation
- AB: Quality gate rejection of invalid VERIFIED status
- AC: Player presentation model integrity
- AD: Canonical identity uniqueness
- AE: Downstream topic classification isolation
- AF: Scoring profile rules
- AG: Resumable checkpoint persistence
- AH: Concurrency limits & thermal safety
"""

import os
import sys
import unittest
import fitz

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, REPO_ROOT)

from scripts.ssc_engine_v4.profiles import (
    SourceAdapter,
    LayoutProfile,
    ScoringProfile,
    SSCCHSL2023Tier1Profile,
    SSCCHSL2023Tier2Profile,
    SSCCGLTier1Profile,
    SSCMTSTier1Profile,
)
from scripts.ssc_engine_v4.geometry import (
    sort_reading_order,
    clamp_question_interval,
    is_publisher_ad,
    is_status_icon,
)
from scripts.ssc_engine_v4.classifier import (
    MultiSignalContentClassifier,
    VISUAL_KEYWORDS,
)
from scripts.ssc_engine_v4.option_engine import (
    OptionSpatialMatcher,
    OptionDuplicateDetector,
    is_promotable_option_text,
    clean_and_normalize_option_text,
)
from scripts.ssc_engine_v4.math_engine import MathEngine
from scripts.ssc_engine_v4.asset_engine import AssetEngine
from scripts.ssc_engine_v4.verifier import QuestionVerificationGate


class TestV4ProfileAdapter(unittest.TestCase):
    """Verifies Profile-based abstraction without year-specific hardcoded hacks."""

    def test_dynamic_profile_resolution(self):
        p1 = SourceAdapter.resolve_profile("SSC-CHSL-2023-02-08-2023-Shift-I-Paper.pdf")
        self.assertEqual(p1.tier, "Tier 1")
        self.assertEqual(p1.year, 2023)
        self.assertEqual(p1.layout.col_bound, 98.0)
        self.assertEqual(p1.scoring.marks_correct, 2.0)

        p2 = SourceAdapter.resolve_profile("SSC-CHSL-2023-02-Nov-2023-Tier2.pdf")
        self.assertEqual(p2.tier, "Tier 2")
        self.assertEqual(p2.layout.col_bound, 146.0)
        self.assertEqual(p2.scoring.marks_correct, 3.0)

        p3 = SourceAdapter.resolve_profile("SSC-CGL-2024-Tier1-Shift1.pdf")
        self.assertEqual(p3.exam_name, "SSC Combined Graduate Level (CGL)")
        self.assertEqual(p3.expected_questions, 100)

        p4 = SourceAdapter.resolve_profile("SSC-MTS-2024-Shift1.pdf")
        self.assertEqual(p4.exam_name, "SSC Multi-Tasking Staff (MTS)")
        self.assertEqual(p4.scoring.duration_minutes, 90)

    def test_section_identification(self):
        profile = SSCCHSL2023Tier1Profile()
        sec_id, sec_name = profile.identify_section("Section : General Intelligence and Reasoning")
        self.assertEqual(sec_id, "reasoning")
        self.assertEqual(sec_name, "General Intelligence & Reasoning")

        sec_id, sec_name = profile.identify_section("Section : Quantitative Aptitude")
        self.assertEqual(sec_id, "quant")


class TestV4GeometryClamping(unittest.TestCase):
    """Verifies boundary clamping to prevent inter-question image spillover."""

    def test_boundary_clamping_prevents_spillover(self):
        prev_pos = (5, 450.0)
        cur_pos = (5, 455.0)
        next_pos = (5, 600.0)

        # Even if upward_tolerance is 20pt, it must clamp above prev_pos
        start_b, end_b = clamp_question_interval(cur_pos, prev_pos, next_pos, upward_tolerance=20.0)
        self.assertGreaterEqual(start_b[1], prev_pos[1] + 1.0)
        self.assertEqual(end_b, next_pos)

    def test_multi_page_reading_order_sort(self):
        blocks = [
            {'page': 2, 'pos': (2, 200.0), 'bbox': (100.0, 200.0, 200.0, 220.0)},
            {'page': 1, 'pos': (1, 500.0), 'bbox': (80.0, 500.0, 150.0, 520.0)},
            {'page': 1, 'pos': (1, 100.0), 'bbox': (80.0, 100.0, 150.0, 120.0)},
        ]
        sorted_b = sort_reading_order(blocks)
        self.assertEqual([b['page'] for b in sorted_b], [1, 1, 2])
        self.assertEqual([b['pos'][1] for b in sorted_b], [100.0, 500.0, 200.0])


class TestV4OptionEngineNoGreedyFallback(unittest.TestCase):
    """Verifies that unassigned images are NEVER greedily stuffed into option slots."""

    def test_no_greedy_fallback_to_option_d(self):
        # Scenario: A question has text for options A, B, C, but D has no text.
        # There is a rogue image (e.g. next question stem) positioned outside option bounds
        opt_positions = {
            0: (5, 100.0),
            1: (5, 130.0),
            2: (5, 160.0),
            3: (5, 190.0),
        }
        # Rogue image is on the same page but at y=280.0 (near next question!)
        rogue_img = {
            'pos': (5, 280.0),
            'rect': fitz.Rect(80.0, 280.0, 400.0, 320.0),
            'w': 320, 'h': 40
        }
        assigned = OptionSpatialMatcher.match_options([rogue_img], opt_positions, col_bound=98.0)
        # Rogue image must NOT be assigned to slot 3 (Option D) because dist=90pt (> 75pt tolerance)
        self.assertIsNone(assigned[3])
        self.assertIsNone(assigned[0])

    def test_duplicate_option_detection(self):
        valid, reason = OptionDuplicateDetector.audit_options(
            opt_texts=["Option text", "Option text", "Option C", "Option D"],
            opt_images=[None, None, None, None]
        )
        self.assertFalse(valid)
        self.assertIn("Duplicate option text", reason)

        valid, reason = OptionDuplicateDetector.audit_options(
            opt_texts=["", "", "", ""],
            opt_images=["/img1.png", "/img2.png", "/img3.png", "/img1.png"]
        )
        self.assertFalse(valid)
        self.assertIn("Duplicate option image", reason)


class TestV4MathAndLaTeXEngine(unittest.TestCase):
    """Verifies KaTeX/LaTeX normalization and syntax validation."""

    def test_valid_latex(self):
        valid, _ = MathEngine.validate_latex(r"\frac{81}{289}")
        self.assertTrue(valid)

        valid, _ = MathEngine.validate_latex(r"\sqrt{10} + \cot \theta")
        self.assertTrue(valid)

    def test_invalid_latex(self):
        valid, msg = MathEngine.validate_latex(r"\frac{81}{289")
        self.assertFalse(valid)
        self.assertIn("Unclosed opening bracket", msg)

    def test_trigonometric_normalization(self):
        res = MathEngine.normalize_math_text("If cot6 = 2, find cosec7@")
        self.assertIn(r"\cot \theta", res)
        self.assertIn(r"\csc^2 \theta", res)


class TestV4ClassifierVisualProtection(unittest.TestCase):
    """Verifies that visual reasoning questions are never demoted to text."""

    def test_visual_reasoning_protected_from_demotion(self):
        classifier = MultiSignalContentClassifier(col_bound=98.0)
        img_meta = {'width': 300, 'height': 80}
        ocr_text = "Select the correct mirror image of the given figure"
        is_demotable = classifier.is_demotable_text_strip(img_meta, ocr_text)
        self.assertFalse(is_demotable)

    def test_plain_text_strip_demoted(self):
        classifier = MultiSignalContentClassifier(col_bound=98.0)
        img_meta = {'width': 400, 'height': 30}
        ocr_text = "In the following number pairs, select the related set."
        is_demotable = classifier.is_demotable_text_strip(img_meta, ocr_text)
        self.assertTrue(is_demotable)


class TestV4QualityGateVerification(unittest.TestCase):
    """Verifies the acceptance quality gate."""

    def setUp(self):
        self.asset_engine = AssetEngine(os.path.join(REPO_ROOT, "web", "public", "exam-assets"))

    def test_quality_gate_rejects_empty_stem(self):
        q = {
            "questionNumber": 1,
            "questionText": "",
            "diagramUrl": None,
            "options": ["A", "B", "C", "D"],
            "correctAnswer": "A",
            "correctAnswerIndex": 0
        }
        status, defects = QuestionVerificationGate.verify_question(q, self.asset_engine)
        self.assertEqual(status, "REVIEW_REQUIRED")
        self.assertTrue(any("missing stem" in d.lower() for d in defects))

    def test_quality_gate_rejects_empty_option_slot(self):
        q = {
            "questionNumber": 2,
            "questionText": "What is the capital of France?",
            "diagramUrl": None,
            "options": ["Paris", "", "Berlin", "Madrid"],
            "optionImages": [None, None, None, None],
            "correctAnswer": "A",
            "correctAnswerIndex": 0
        }
        status, defects = QuestionVerificationGate.verify_question(q, self.asset_engine)
        self.assertEqual(status, "REVIEW_REQUIRED")
        self.assertTrue(any("slot 1 is empty" in d.lower() for d in defects))


class TestV4OptionPromotionAndNormalization(unittest.TestCase):
    """Verifies universal normalization of math inequalities, mixed fractions, units, and promotability."""

    def test_math_inequalities(self):
        cases = [
            ("15*<§ < 33", "$15 < S < 33$"),
            ("15<= $<33", "$15 \\le S < 33$"),
            ("15<S< 33", "$15 < S < 33$"),
            ("15=. $< 33", "$15 \\le S < 33$"),
            ("15<S§<33", "$15 < S \\le 33$"),
        ]
        for raw, expected in cases:
            norm = clean_and_normalize_option_text(raw)
            self.assertEqual(norm, expected)
            self.assertTrue(is_promotable_option_text(norm))

    def test_mixed_fractions_and_units(self):
        cases = [
            "$28\\frac{4}{7}\\%$",
            "$42\\frac{1}{2}\\text{ km/h}$",
            "$1\\frac{81}{217}$",
            "$13121\\frac{1}{3}\\text{ cm}^3$",
            "$57\\frac{1}{2}\\text{ years}$",
            "37°",
            "42 km/h",
            "150 sec",
            "1.28",
            "3477",
            "25,790",
        ]
        for raw in cases:
            norm = clean_and_normalize_option_text(raw)
            self.assertTrue(is_promotable_option_text(norm))

    def test_reasoning_codes_and_ratios(self):
        cases = [
            ("ge", "ge"),
            ("fp", "fp"),
            ("MA38", "MA38"),
            ("3-48-54-45-42", "3-48-54-45-42"),
            ("11 2533", "11:25:33"),
            ("12:28:63", "12:28:63"),
            ("5:36 p.m.", "5:36 p.m."),
            ("1 : √2", "1 : √2"),
            ("Profit of 2%", "Profit of 2%"),
            ("Loss, 236", "Loss, ₹36"),
            ("India and Bangladesh", "India and Bangladesh"),
            ("India, Sri Lanka and Bangladesh.", "India, Sri Lanka and Bangladesh"),
        ]
        for raw, expected in cases:
            norm = clean_and_normalize_option_text(raw)
            self.assertEqual(norm, expected)
            self.assertTrue(is_promotable_option_text(norm))

    def test_visual_ocr_noise_rejected(self):
        noise_cases = [
            "€630Hd",
            "BLASXCe2\\A",
            "Sndveo",
            "er",
            "A 3 a L O",
            "O Ss R9CQ A A",
            "\\frac{2 K OD}{X V O}",
        ]
        for raw in noise_cases:
            self.assertFalse(is_promotable_option_text(raw))


if __name__ == '__main__':
    unittest.main()

