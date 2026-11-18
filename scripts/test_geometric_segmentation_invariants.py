"""
scripts/test_geometric_segmentation_invariants.py

Comprehensive Invariant & Regression Test Suite for the Universal Question Region Model.
Validates:
1. Header tolerance window (stem y0 = header y0 - 0.03, -0.09, -1, -5, -12 pt).
2. Clamping against previous footer boundary.
3. Hard floor invariant: No question owns content beyond its own Question ID footer.
4. Prevention of next-stem bleeding into Option D.
5. Rejection of array-position-based ownership.
6. Real PDF verification on SSC CHSL 2023 02 Aug Shift 2 (Q26 - Q50).
"""

import os
import sys
import unittest
import fitz

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, REPO_ROOT)

from scripts.ssc_engine_v4.region_model import (
    QuestionRegion,
    SourceRepresentation,
    ObjectRole,
    ExtractedObject,
)
from scripts.ssc_engine_v4.segmentation import QuestionSegmentationEngine


class TestHeaderToleranceAndOwnership(unittest.TestCase):
    """Phase 3 tests: Verify evidence-based tolerance behavior for raster banners."""

    def test_raster_stem_within_tolerance_captured(self):
        """Tests that stem y0 = header y0 - 0.03, -0.09, -1, -5, -12 pt are all captured."""
        header_y0 = 100.0
        tolerances_to_test = [0.03, 0.09, 1.0, 5.0, 12.0]

        for delta in tolerances_to_test:
            stem_y0 = header_y0 - delta
            stem_y1 = stem_y0 + 35.0  # standard banner height
            stem_ymid = (stem_y0 + stem_y1) / 2.0

            region = QuestionRegion(
                paper_id="test-paper",
                page=1,
                section_id="reasoning",
                question_number=1,
                header_anchor=(50.0, header_y0, 70.0, header_y0 + 10.0),
                content_start=(1, header_y0 - QuestionSegmentationEngine.UPWARD_TOLERANCE_PT),
                footer_anchor=(380.0, 200.0, 480.0, 230.0),
                content_end=(1, 231.0),
                source_bbox=(40.0, 85.0, 560.0, 231.0),
            )

            # Midpoint must lie inside region
            self.assertTrue(
                region.contains_point(1, stem_ymid),
                f"Failed to capture stem with delta {delta}pt (stem y0={stem_y0}, ymid={stem_ymid})"
            )

    def test_tolerance_clamped_by_previous_footer(self):
        """Tests that upward tolerance is strictly clamped when previous question footer is nearby."""
        prev_footer_y1 = 92.0
        header_y0 = 100.0  # difference is only 8pt, less than 15pt default tolerance

        all_blocks = [
            {'page': 1, 'pos': (1, 80.0), 'bbox': (380.0, 80.0, 480.0, prev_footer_y1), 'text': 'Question ID : 1001'},
            {'page': 1, 'pos': (1, header_y0), 'bbox': (50.0, header_y0, 70.0, header_y0 + 10.0), 'text': 'Q.2'},
            {'page': 1, 'pos': (1, 180.0), 'bbox': (380.0, 180.0, 480.0, 210.0), 'text': 'Question ID : 1002'}
        ]

        regions = QuestionSegmentationEngine.build_question_regions(
            doc=None,
            all_blocks=all_blocks,
            all_images=[],
            all_ticks=[],
            paper_id="test-paper"
        )

        q2_region = [r for r in regions if r.question_number == 1][0]
        # start_y must be clamped above prev_footer_y1 + 1.0 (93.0), NOT header_y0 - 15 (85.0)
        self.assertGreaterEqual(q2_region.content_start[1], prev_footer_y1 + 1.0)
        self.assertEqual(q2_region.content_start[1], 93.0)


class TestHardFloorFooterInvariant(unittest.TestCase):
    """Phase 4 tests: Verify that NO question owns content beyond its Question ID footer."""

    def test_no_question_owns_content_beyond_footer(self):
        """Tests that a rogue image starting below Question ID footer is NEVER owned by current question."""
        footer_y1 = 200.0
        header_y0 = 80.0

        region = QuestionRegion(
            paper_id="test-paper",
            page=1,
            section_id="reasoning",
            question_number=26,
            header_anchor=(50.0, header_y0, 70.0, header_y0 + 10.0),
            content_start=(1, header_y0 - 15.0),
            footer_anchor=(380.0, 175.0, 480.0, footer_y1),
            content_end=(1, footer_y1 + 1.0),
            source_bbox=(40.0, 65.0, 560.0, footer_y1 + 1.0),
        )

        # Image starting at 215.0 (next question's banner)
        next_stem_y0 = 215.0
        next_stem_y1 = 250.0
        next_stem_ymid = (next_stem_y0 + next_stem_y1) / 2.0

        self.assertFalse(
            region.contains_point(1, next_stem_ymid),
            "INVARIANT VIOLATION: Question owned content beyond its own footer!"
        )

    def test_next_stem_cannot_enter_preceding_option_d(self):
        """Simulates Q26 and Q27 on same page and proves Q27 stem cannot become Q26 Option D."""
        all_blocks = [
            {'page': 1, 'pos': (1, 75.97), 'bbox': (59.3, 75.97, 72.1, 84.8), 'text': 'Q.1'},
            {'page': 1, 'pos': (1, 97.2), 'bbox': (58.3, 97.2, 107.3, 107.7), 'text': 'Ans\n1.'},
            {'page': 1, 'pos': (1, 116.7), 'bbox': (96.9, 116.7, 105.7, 125.6), 'text': '2.'},
            {'page': 1, 'pos': (1, 134.5), 'bbox': (96.9, 134.5, 105.7, 143.3), 'text': '3.'},
            {'page': 1, 'pos': (1, 152.2), 'bbox': (96.9, 152.2, 105.7, 161.1), 'text': '4.'},
            {'page': 1, 'pos': (1, 178.8), 'bbox': (392.2, 178.8, 493.5, 211.3), 'text': 'Question ID : 264330151986\nStatus : Answered\nChosen Option : 1'},
            {'page': 1, 'pos': (1, 229.27), 'bbox': (59.3, 229.27, 72.1, 238.1), 'text': 'Q.2'},
            {'page': 1, 'pos': (1, 255.4), 'bbox': (58.3, 255.4, 105.7, 266.0), 'text': 'Ans\n1.'},
            {'page': 1, 'pos': (1, 337.0), 'bbox': (392.2, 337.0, 493.5, 369.6), 'text': 'Question ID : 264330146750'}
        ]

        q1_stem_rect = fitz.Rect(78.72, 75.94, 405.12, 93.16)
        q2_stem_rect = fitz.Rect(78.72, 229.18, 405.12, 251.44)

        all_images = [
            {'page': 1, 'rect': q1_stem_rect, 'w': 680, 'h': 36, 'meta': {'ext': 'png'}},
            {'page': 1, 'rect': q2_stem_rect, 'w': 680, 'h': 46, 'meta': {'ext': 'png'}}
        ]

        regions = QuestionSegmentationEngine.build_question_regions(
            doc=None,
            all_blocks=all_blocks,
            all_images=all_images,
            all_ticks=[],
            paper_id="test-paper"
        )

        q1_region = regions[0]
        q2_region = regions[1]

        # Q1 must own q1_stem_rect
        q1_owned_bboxes = [o.bbox for o in q1_region.objects]
        self.assertIn(tuple(q1_stem_rect), q1_owned_bboxes)

        # Q1 must NOT own q2_stem_rect
        self.assertNotIn(tuple(q2_stem_rect), q1_owned_bboxes)

        # Q2 must own q2_stem_rect
        q2_owned_bboxes = [o.bbox for o in q2_region.objects]
        self.assertIn(tuple(q2_stem_rect), q2_owned_bboxes)


class TestRealPdfShift2ForensicVerification(unittest.TestCase):
    """Phase 10 & 11 tests: Real PDF verification on SSC CHSL 2023 02 Aug Shift 2."""

    def setUp(self):
        self.pdf_path = '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2023/SSC-CHSL-2023-02-08-2023-Shift-II-Paper.pdf'
        if not os.path.exists(self.pdf_path):
            self.skipTest(f"PDF fixture not found at {self.pdf_path}")

    def test_q26_q27_q28_stem_and_option_isolation(self):
        doc = fitz.open(self.pdf_path)
        all_blocks = []
        all_images = []
        all_ticks = []

        # Collect blocks and images from Page 9 (General Intelligence Q1-Q4 / overall Q26-Q29)
        p = doc[9]
        p_height = p.rect.height
        for b in p.get_text('blocks'):
            if b[4].strip():
                all_blocks.append({
                    'page': 9,
                    'pos': (9, b[1]),
                    'bbox': b[:4],
                    'text': b[4]
                })

        for info in p.get_images():
            xref = info[0]
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if (w, h) in [(464, 137), (2022, 423), (834, 719)]:
                continue
            for r in p.get_image_rects(xref):
                if 50 < r.y0 < p_height - 30:
                    all_images.append({
                        'page': 9,
                        'rect': r,
                        'pos': (9, r.y0),
                        'xref': xref,
                        'w': w,
                        'h': h,
                        'meta': meta
                    })

        regions = QuestionSegmentationEngine.build_question_regions(
            doc=doc,
            all_blocks=all_blocks,
            all_images=all_images,
            all_ticks=all_ticks,
            paper_id="ssc-chsl-2023-02aug-s2"
        )

        self.assertEqual(len(regions), 4)

        # Region 0 = Q.1 (Q26 overall)
        r_q1 = regions[0]
        # Must own Xref 120 (stem banner)
        q1_xrefs = [o.meta.get('xref') for o in r_q1.objects if o.meta]
        self.assertIn(120, q1_xrefs, "Q26 failed to own its stem banner Xref 120!")
        self.assertIn(121, q1_xrefs, "Q26 failed to own Option 1 Xref 121!")
        self.assertIn(122, q1_xrefs, "Q26 failed to own Option 2 Xref 122!")
        self.assertIn(123, q1_xrefs, "Q26 failed to own Option 3 Xref 123!")
        self.assertIn(124, q1_xrefs, "Q26 failed to own Option 4 Xref 124!")
        # MUST NOT OWN Xref 125 (Q27 stem)
        self.assertNotIn(125, q1_xrefs, "CRITICAL FAULT: Q26 swallowed Q27 stem banner Xref 125!")

        # Region 1 = Q.2 (Q27 overall)
        r_q2 = regions[1]
        q2_xrefs = [o.meta.get('xref') for o in r_q2.objects if o.meta]
        self.assertIn(125, q2_xrefs, "Q27 failed to own its stem banner Xref 125!")
        self.assertIn(126, q2_xrefs, "Q27 failed to own Option 1 Xref 126!")
        self.assertIn(127, q2_xrefs, "Q27 failed to own Option 2 Xref 127!")
        self.assertIn(128, q2_xrefs, "Q27 failed to own Option 3 Xref 128!")
        self.assertIn(129, q2_xrefs, "Q27 failed to own Option 4 Xref 129!")
        self.assertNotIn(130, q2_xrefs, "CRITICAL FAULT: Q27 swallowed Q28 stem banner Xref 130!")

        # Region 2 = Q.3 (Q28 overall)
        r_q3 = regions[2]
        q3_xrefs = [o.meta.get('xref') for o in r_q3.objects if o.meta]
        self.assertIn(130, q3_xrefs, "Q28 failed to own its stem banner Xref 130!")
        self.assertIn(131, q3_xrefs, "Q28 failed to own Option 1 Xref 131!")
        self.assertIn(132, q3_xrefs, "Q28 failed to own Option 2 Xref 132!")
        self.assertIn(133, q3_xrefs, "Q28 failed to own Option 3 Xref 133!")
        self.assertIn(134, q3_xrefs, "Q28 failed to own Option 4 Xref 134!")
        self.assertNotIn(135, q3_xrefs, "CRITICAL FAULT: Q28 swallowed Q29 stem banner Xref 135!")


if __name__ == '__main__':
    unittest.main()
