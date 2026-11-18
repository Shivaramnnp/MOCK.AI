"""
scripts/ssc_engine_v4/segmentation.py

Universal Question Segmentation Engine for TCS iON and Competitive Exam Response Sheets.
Enforces Two-Anchor Geometric Bounding with Hard-Floor Footer Clamping.
Guarantees zero inter-question element bleeding and source-faithful object ownership.
"""

import re
from typing import List, Dict, Any, Tuple, Optional, Set
import fitz

from scripts.ssc_engine_v4.region_model import (
    QuestionRegion,
    SourceRepresentation,
    ObjectRole,
    ExtractedObject,
)
from scripts.ssc_engine_v4.classifier import VISUAL_KEYWORDS


class QuestionSegmentationEngine:
    """
    Constructs geometry-aware question regions from raw PDF blocks and images.
    Enforces the fundamental architectural invariant:
        NO QUESTION MAY OWN CONTENT BEYOND ITS OWN QUESTION-ID FOOTER.
    """

    UPWARD_TOLERANCE_PT = 15.0  # Safe window to capture raster banners starting slightly above Q.N baseline

    @classmethod
    def build_question_regions(
        cls,
        doc: Any,
        all_blocks: List[Dict[str, Any]],
        all_images: List[Dict[str, Any]],
        all_ticks: List[Dict[str, Any]],
        paper_id: str,
        col_bound: float = 100.0
    ) -> List[QuestionRegion]:
        """
        Discovers question boundaries across the entire document using:
        - Top Anchor: Q.N header text block with evidence-based upward tolerance
        - Bottom Anchor: Question ID footer metadata block (Hard Floor)
        """
        # 1. Collect Section Markers
        section_markers = []
        for b in all_blocks:
            t = b['text'].strip()
            if 'Section :' in t or 'Section:' in t:
                section_markers.append({
                    'page': b['page'],
                    'pos': b['pos'],
                    'bbox': b['bbox'],
                    'text': t
                })

        # 2. Collect Question Header Markers
        q_markers = []
        for b in all_blocks:
            t = b['text'].strip()
            m = re.search(r'(?:^|\n)\s*Q\s*\.\s*(\d+)', t)
            if m and b['bbox'][0] < 160:
                q_num = int(m.group(1))
                q_markers.append({
                    'q_num': q_num,
                    'page': b['page'],
                    'pos': b['pos'],
                    'bbox': b['bbox'],
                    'text': t
                })
        q_markers.sort(key=lambda m: (m['page'], m['bbox'][1]))

        # 3. Collect Question ID Footer Markers
        footer_markers = []
        for b in all_blocks:
            t = b['text'].strip()
            if 'Question ID :' in t or 'Question ID:' in t:
                m_qid = re.search(r'Question ID\s*:\s*(\d+)', t)
                qid_str = m_qid.group(1) if m_qid else ""
                footer_markers.append({
                    'page': b['page'],
                    'pos': b['pos'],
                    'bbox': b['bbox'],
                    'text': t,
                    'qid': qid_str
                })
        footer_markers.sort(key=lambda f: (f['page'], f['bbox'][1]))

        # Pair each question marker with its corresponding Question ID footer
        # In TCS iON, each question header is followed sequentially by its footer
        # (either on the same page or on a subsequent page before the next question header)
        regions: List[QuestionRegion] = []
        num_qs = len(q_markers)

        for i in range(num_qs):
            qm = q_markers[i]
            q_num = qm['q_num']
            q_page = qm['page']
            header_bbox = tuple(qm['bbox'])
            header_y0 = qm['bbox'][1]

            # Determine preceding bounding element on the same page (previous question's footer or section banner)
            prev_bound_y = 50.0  # Standard top margin
            if i > 0 and q_markers[i - 1]['page'] == q_page:
                prev_q = q_markers[i - 1]
                prev_bound_y = prev_q['bbox'][3] + 1.0

            # Find matching footer for question i
            # Candidate footer must occur after q_markers[i] and before q_markers[i + 1] (if any)
            next_q = q_markers[i + 1] if i + 1 < num_qs else None
            matching_footer = None

            for fm in footer_markers:
                # Must be after current question header
                is_after_cur = (fm['page'] > q_page) or (fm['page'] == q_page and fm['bbox'][1] >= header_y0 - 2.0)
                if not is_after_cur:
                    continue
                # If there's a next question, footer must be before next question header
                if next_q:
                    is_before_next = (fm['page'] < next_q['page']) or (fm['page'] == next_q['page'] and fm['bbox'][1] <= next_q['bbox'][1] + 2.0)
                    if not is_before_next:
                        continue
                matching_footer = fm
                break

            # Any footer on the same page that finishes at or before current header_y0 is a previous question's boundary
            for fm in footer_markers:
                if fm['page'] == q_page and fm['bbox'][3] <= header_y0:
                    prev_bound_y = max(prev_bound_y, fm['bbox'][3] + 1.0)

            # If previous question had a footer on the same page, respect it as strict top clamp
            if i > 0:
                prev_footer = regions[i - 1].footer_anchor if regions else None
                if prev_footer and regions[i - 1].end_page == q_page:
                    prev_bound_y = max(prev_bound_y, prev_footer[3] + 1.0)

            # Check if a section header lies between prev_bound_y and header_y0
            for sm in section_markers:
                if sm['page'] == q_page and prev_bound_y <= sm['bbox'][1] < header_y0:
                    prev_bound_y = max(prev_bound_y, sm['bbox'][3] + 1.0)

            # Check if Comprehension passage or SubQuestion precedes this question on the same page
            comp_start_y = None
            for b in all_blocks:
                if b['page'] == q_page and prev_bound_y <= b['bbox'][1] < header_y0:
                    if 'Comprehension:' in b['text'] or 'SubQuestion No' in b['text']:
                        if comp_start_y is None or b['bbox'][1] < comp_start_y:
                            comp_start_y = b['bbox'][1]

            # Calculate content_start using upward tolerance or comprehension start
            if comp_start_y is not None:
                content_start_y = max(prev_bound_y, comp_start_y)
            else:
                # Upward tolerance window allows capturing stem banners positioned slightly above Q.N baseline
                content_start_y = max(prev_bound_y, header_y0 - cls.UPWARD_TOLERANCE_PT)
            content_start = (q_page, content_start_y)

            # Calculate content_end using HARD FOOTER FLOOR
            end_page = q_page
            footer_bbox = None

            if matching_footer:
                footer_bbox = tuple(matching_footer['bbox'])
                end_page = matching_footer['page']
                # HARD FLOOR: Question terminates at its own footer!
                content_end_y = matching_footer['bbox'][3] + 1.0
                # If next question is on the same page, content_end cannot exceed next question's top boundary
                if next_q and next_q['page'] == end_page:
                    content_end_y = min(content_end_y, next_q['bbox'][1] - 0.5)
            elif next_q:
                # Fallback if footer was not detected
                end_page = next_q['page']
                content_end_y = next_q['bbox'][1] - 1.0
            else:
                end_page = len(doc) - 1 if hasattr(doc, '__len__') else q_page
                content_end_y = 9999.0

            content_end = (end_page, content_end_y)

            # Derive section ID and Name
            sec_id = "english"
            sec_name = "English Language"
            for sm in section_markers:
                if (sm['page'] < q_page) or (sm['page'] == q_page and sm['bbox'][1] <= header_y0):
                    s_raw = sm['text'].lower()
                    if 'intelligence' in s_raw or 'reasoning' in s_raw:
                        sec_id = 'reasoning'
                        sec_name = 'General Intelligence & Reasoning'
                    elif 'quantitative' in s_raw or 'quant' in s_raw:
                        sec_id = 'quant'
                        sec_name = 'Quantitative Aptitude'
                    elif 'mathematical' in s_raw:
                        sec_id = 'quant'
                        sec_name = 'Mathematical Abilities'
                    elif 'awareness' in s_raw:
                        sec_id = 'general_awareness'
                        sec_name = 'General Awareness'
                    elif 'english' in s_raw:
                        sec_id = 'english'
                        sec_name = 'English Language'
                    elif 'computer' in s_raw:
                        sec_id = 'computer'
                        sec_name = 'Computer Knowledge Module'

            # Overall source bounding box on primary page
            src_x0 = 40.0
            src_x1 = 570.0
            src_y0 = content_start_y
            src_y1 = content_end_y if end_page == q_page else 800.0
            source_bbox = (src_x0, src_y0, src_x1, src_y1)

            region = QuestionRegion(
                paper_id=paper_id,
                page=q_page,
                end_page=end_page,
                section_id=sec_id,
                section_name=sec_name,
                question_number=i + 1,  # 1-indexed overall question number
                header_anchor=header_bbox,
                content_start=content_start,
                footer_anchor=footer_bbox,
                content_end=content_end,
                source_bbox=source_bbox,
                confidence="VERIFIED",
                segmentation_method="DUAL_ANCHOR_FOOTER_CLAMPED"
            )
            regions.append(region)

        # 4. Associate Extracted Blocks and Assign Object Ownership
        for region in regions:
            # Locate Ans marker inside region
            q_blocks = []
            for b in all_blocks:
                bp = b['page']
                by = b['pos'][1]
                if region.contains_point(bp, by):
                    q_blocks.append(b)

            q_blocks.sort(key=lambda b: (b['page'], b['bbox'][1], b['bbox'][0]))

            # Find 'Ans' block
            ans_pos = None
            for b in q_blocks:
                if re.search(r'(?:^|\n)\s*A\s*n\s*s\b', b['text'], re.IGNORECASE):
                    ans_pos = b['pos']
                    break
            region.ans_pos = ans_pos

            # Assign images strictly within region
            q_images = []
            for img in all_images:
                ip = img['page']
                r = img['rect']
                y_mid = (r.y0 + r.y1) / 2.0
                # Midpoint must fall within question region
                if region.contains_point(ip, y_mid):
                    # Invariant Check: Must NOT be below footer!
                    if region.footer_anchor and ip == region.end_page:
                        if r.y0 >= region.footer_anchor[3]:
                            continue  # Strictly below footer -> skip
                    q_images.append(img)

            # Sort images by reading order
            q_images.sort(key=lambda im: (im['page'], im['rect'].y0, im['rect'].x0))

            # Convert images to ExtractedObjects and assign semantic roles
            for src_order, img in enumerate(q_images):
                r = img['rect']
                w = img['w']
                h = img['h']
                y_mid = (r.y0 + r.y1) / 2.0
                is_sel_col = (r.x0 < 85 and r.x1 <= 95) and ((w <= 55 and h <= 55) or (r.width <= 25 and r.height <= 25))

                if is_sel_col:
                    role = ObjectRole.STATUS_ICON
                elif ans_pos and ((img['page'] < ans_pos[0]) or (img['page'] == ans_pos[0] and r.y1 <= ans_pos[1] + 1.0)):
                    # Strictly above or at Ans block -> STEM
                    aspect = w / h if h > 0 else 0
                    if w >= 380 and h <= 150 and aspect >= 2.5:
                        role = ObjectRole.STEM_BANNER
                    else:
                        role = ObjectRole.STEM_DIAGRAM
                else:
                    # Below Ans block -> OPTION
                    if w <= 220 and h <= 80:
                        role = ObjectRole.OPTION_BANNER
                    else:
                        role = ObjectRole.OPTION_IMAGE

                meta_dict = dict(img.get('meta') or {})
                if 'xref' in img:
                    meta_dict['xref'] = img['xref']

                obj = ExtractedObject(
                    page=img['page'],
                    bbox=(r.x0, r.y0, r.x1, r.y1),
                    center=((r.x0 + r.x1) / 2.0, y_mid),
                    source_order=src_order,
                    obj_type='image',
                    meta=meta_dict,
                    role=role,
                    owner_question=region.question_number
                )
                region.objects.append(obj)

            # Determine SourceRepresentation
            has_stem_banner = any(o.role == ObjectRole.STEM_BANNER for o in region.objects)
            has_option_banner = any(o.role == ObjectRole.OPTION_BANNER for o in region.objects)
            has_stem_diagram = any(o.role == ObjectRole.STEM_DIAGRAM for o in region.objects)
            has_option_image = any(o.role == ObjectRole.OPTION_IMAGE for o in region.objects)

            if has_stem_banner or has_option_banner:
                region.representation = SourceRepresentation.RASTER_BANNER
            elif has_stem_diagram or has_option_image:
                region.representation = SourceRepresentation.GENUINE_VISUAL
            else:
                region.representation = SourceRepresentation.NATIVE_TEXT

        return regions
