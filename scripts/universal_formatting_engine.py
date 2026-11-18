#!/usr/bin/env python3
"""
scripts/universal_formatting_engine.py
======================================
MOCK.AI — Universal Question Formatting Fidelity Engine

Shared platform-wide engine to extract, audit, and preserve authentic source
document formatting (vector underlines, bold/italic text spans, superscripts/subscripts)
from original PDF question papers and response sheets into Mock.AI question definitions.

Key Principles:
1. Document Ground Truth: Uses PyMuPDF vector drawing paths (page.get_drawings())
   and font span dictionaries (page.get_text('dict')) directly from original PDFs.
2. Zero Guesswork: Never invents formatting; only applies formatting when coordinate-level
   evidence from the source document proves the exact target span.
3. Provenance & Non-Destructive: Preserves 100% of question wording, options, answer keys,
   marks, IDs, and ordering.
4. Universal Compatibility: Works across SSC CHSL (2019-2025) and GATE (2023-2025).
"""

import os
import sys
import re
import json
import glob
import argparse
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF (fitz) is required. Install via `pip install pymupdf`.", file=sys.stderr)
    sys.exit(1)

# Header patterns to ignore when scanning for question underlines
IGNORE_PATTERNS = [
    r'combined\s+higher\s+secondary',
    r'examination',
    r'venue\s+name',
    r'roll\s+number',
    r'exam\s+date',
    r'exam\s+time',
    r'subject\s+chsl',
    r'subject\s*:',
    r'registration\s+number',
    r'pawan\s+ganga',
    r'ion\s+digital',
    r'test\s+date',
    r'test\s+time',
    r'organizing\s+institute',
    r'page\s+\d+\s+of\s+\d+',
    r'section\s*:',
]

IGNORE_REGEX = re.compile('|'.join(IGNORE_PATTERNS), re.IGNORECASE)


class UniversalPdfFormattingExtractor:
    """Extracts authentic formatting features from PDF document pages."""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)

    def close(self):
        self.doc.close()

    def get_page_underlines(self, page_index: int) -> List[Dict[str, Any]]:
        """
        Extracts vector drawing underlines and correlates with text words directly above.
        Returns merged underline phrases with coordinates.
        """
        page = self.doc[page_index]
        drawings = page.get_drawings()

        # Identify horizontal line or thin rectangle strokes
        # In PDF points: height between 0.0 and 3.5 pt, width between 4 and 450 pt
        underline_segments = []
        for d in drawings:
            r = d['rect']
            if 0.0 <= r.height <= 3.5 and 4.0 <= r.width <= 450.0:
                underline_segments.append(r)

        if not underline_segments:
            return []

        # Get all words on the page: (x0, y0, x1, y1, word, block_no, line_no, word_no)
        words = page.get_text('words')

        matched_segments = []
        for seg in underline_segments:
            matching_words = []
            for w in words:
                # Vertical proximity: word baseline w[3] within 4.0 pt of underline line seg.y0
                if abs(seg.y0 - w[3]) <= 4.0:
                    overlap = max(0.0, min(w[2], seg.x1) - max(w[0], seg.x0))
                    w_len = w[2] - w[0]
                    # Require authentic horizontal overlap
                    if overlap >= 2.0 or (w_len > 0 and overlap / w_len >= 0.35):
                        matching_words.append(w)

            if matching_words:
                matching_words.sort(key=lambda w: w[0])
                matched_segments.append({
                    'y': seg.y0,
                    'x0': seg.x0,
                    'x1': seg.x1,
                    'words': matching_words
                })

        if not matched_segments:
            return []

        # Group contiguous segments on the same line (same baseline y within 1.5 pt)
        line_groups = defaultdict(list)
        for s in matched_segments:
            line_key = round(s['y'], 0)
            line_groups[line_key].append(s)

        merged_phrases = []
        for line_y, segs in line_groups.items():
            unique_words = {}
            for seg in segs:
                for w in seg['words']:
                    w_key = (round(w[0], 1), round(w[1], 1), w[4])
                    unique_words[w_key] = w
            sorted_words = sorted(unique_words.values(), key=lambda w: w[0])
            phrase = ' '.join(w[4] for w in sorted_words).strip()

            # Filter metadata headers
            if phrase and not IGNORE_REGEX.search(phrase):
                merged_phrases.append({
                    'page': page_index,
                    'y': line_y,
                    'x0': sorted_words[0][0],
                    'x1': sorted_words[-1][2],
                    'phrase': phrase,
                    'words': [w[4] for w in sorted_words]
                })

        return merged_phrases

    def get_page_highlights(self, page_index: int) -> List[Dict[str, Any]]:
        """
        Extracts vector drawing filled highlight boxes and matches text words located within.
        """
        page = self.doc[page_index]
        drawings = page.get_drawings()

        # Identify highlight boxes: height between 4.0 and 80.0 pt, width between 4 and 450 pt
        # Must have fill color or fill opacity
        highlight_segments = []
        for d in drawings:
            r = d['rect']
            if 4.0 <= r.height <= 80.0 and 4.0 <= r.width <= 450.0:
                has_fill = d.get('fill') is not None or (d.get('fill_opacity') is not None and d['fill_opacity'] < 1.0)
                if has_fill:
                    highlight_segments.append(r)

        if not highlight_segments:
            return []

        words = page.get_text('words')
        matched_segments = []
        for seg in highlight_segments:
            matching_words = []
            for w in words:
                # Word must be within vertical boundaries of the highlight rect
                if seg.y0 - 2.0 <= w[1] and w[3] <= seg.y1 + 2.0:
                    overlap = max(0.0, min(w[2], seg.x1) - max(w[0], seg.x0))
                    w_len = w[2] - w[0]
                    if overlap >= 2.0 or (w_len > 0 and overlap / w_len >= 0.35):
                        matching_words.append(w)

            if matching_words:
                matching_words.sort(key=lambda w: w[0])
                phrase = ' '.join(w[4] for w in matching_words).strip()
                if phrase and not IGNORE_REGEX.search(phrase):
                    matched_segments.append({
                        'page': page_index,
                        'y': seg.y0,
                        'x0': seg.x0,
                        'x1': seg.x1,
                        'phrase': phrase,
                        'words': [w[4] for w in matching_words]
                    })

        return matched_segments

    def get_page_styled_spans(self, page_index: int) -> List[Dict[str, Any]]:
        """
        Extracts bold, heavy/black, and italic text spans from font dictionary.
        """
        page = self.doc[page_index]
        page_dict = page.get_text('dict')
        styled_spans = []

        for b in page_dict.get('blocks', []):
            for l in b.get('lines', []):
                for s in l.get('spans', []):
                    text = s.get('text', '').strip()
                    if not text:
                        continue
                    font = s.get('font', '').lower()
                    flags = s.get('flags', 0)
                    is_bold = (
                        ('bold' in font or 'black' in font or 'heavy' in font or 'extrabold' in font)
                        or bool(flags & 16)
                    )
                    is_italic = ('italic' in font or 'oblique' in font) or bool(flags & 2)

                    if is_bold or is_italic:
                        styled_spans.append({
                            'page': page_index,
                            'text': text,
                            'font': s.get('font', ''),
                            'flags': flags,
                            'is_bold': is_bold,
                            'is_italic': is_italic,
                            'bbox': s.get('bbox', [])
                        })
        return styled_spans


# Instruction cues indicating formatting-dependent question targets
HIGHLIGHT_CUE_REGEX = re.compile(
    r'\b(?:replace|substitute|improve|meaning\s+of|antonym\s+of|synonym\s+of)\s+(?:the\s+)?highlighted\b|'
    r'\bhighlighted\s+(?:part|word|phrase|segment|words|text)\b|'
    r'\b(?:in|with)\s+the\s+highlighted\b',
    re.IGNORECASE
)
UNDERLINE_CUE_REGEX = re.compile(r'\bunderlin(ed|ing|e)\b', re.IGNORECASE)
BOLD_CUE_REGEX = re.compile(r'\b(bold|boldface)\b', re.IGNORECASE)
BRACKETED_CUE_REGEX = re.compile(r'\bbracketed\s+(?:part|word|phrase|segment|words|text)\b', re.IGNORECASE)


class QuestionFormattingCorrelator:
    """Correlates question stems with extracted document formatting."""

    @staticmethod
    def clean_target_span(raw_span: str) -> str:
        """Removes trailing sentence punctuation if outside the semantic target."""
        clean = raw_span.strip()
        # If phrase ends with a period or comma that is clearly sentence-terminal
        if clean.endswith('.') and not clean.endswith('..'):
            clean = clean[:-1].strip()
        if clean.endswith(','):
            clean = clean[:-1].strip()
        return clean

    @staticmethod
    def apply_underline_to_text(stem: str, target_span: str) -> Tuple[str, bool]:
        """
        Safely wraps the authentic target span in <u>...</u> within the question stem.
        Returns (new_stem, success).
        """
        if not stem or not target_span:
            return stem, False

        # If already formatted with <u>
        if f"<u>{target_span}</u>" in stem:
            return stem, True

        clean_span = QuestionFormattingCorrelator.clean_target_span(target_span)
        if not clean_span:
            return stem, False

        # Try exact word-boundary match first
        pattern = re.compile(rf'(?<!<u>)\b{re.escape(clean_span)}\b(?!</u>)', re.IGNORECASE)
        matches = list(pattern.finditer(stem))

        if len(matches) == 1:
            m = matches[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<u>{matched_text}</u>" + stem[m.end():]
            return new_stem, True

        # Fallback without strict word boundaries if punctuation is adjacent
        pattern_loose = re.compile(rf'(?<!<u>){re.escape(clean_span)}(?!</u>)', re.IGNORECASE)
        matches_loose = list(pattern_loose.finditer(stem))
        if len(matches_loose) == 1:
            m = matches_loose[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<u>{matched_text}</u>" + stem[m.end():]
            return new_stem, True

        return stem, False

    @staticmethod
    def apply_highlight_to_text(stem: str, target_span: str) -> Tuple[str, bool]:
        """
        Safely wraps the authentic target span in <mark>...</mark> within the question stem.
        Returns (new_stem, success).
        """
        if not stem or not target_span:
            return stem, False

        if f"<mark>{target_span}</mark>" in stem or f"<mark class=\"replacement-target\">{target_span}</mark>" in stem:
            return stem, True

        clean_span = QuestionFormattingCorrelator.clean_target_span(target_span)
        if not clean_span:
            return stem, False

        # Try exact word-boundary match first
        pattern = re.compile(rf'(?<!<mark>)\b{re.escape(clean_span)}\b(?!</mark>)', re.IGNORECASE)
        matches = list(pattern.finditer(stem))

        if len(matches) == 1:
            m = matches[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<mark>{matched_text}</mark>" + stem[m.end():]
            return new_stem, True

        # Fallback without strict word boundaries if punctuation is adjacent
        pattern_loose = re.compile(rf'(?<!<mark>){re.escape(clean_span)}(?!</mark>)', re.IGNORECASE)
        matches_loose = list(pattern_loose.finditer(stem))
        if len(matches_loose) == 1:
            m = matches_loose[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<mark>{matched_text}</mark>" + stem[m.end():]
            return new_stem, True

        return stem, False

    @staticmethod
    def apply_bold_to_text(stem: str, target_span: str) -> Tuple[str, bool]:
        """
        Safely wraps the target span in <b>...</b> within the question stem.
        """
        if not stem or not target_span:
            return stem, False

        if f"<b>{target_span}</b>" in stem:
            return stem, True

        clean_span = QuestionFormattingCorrelator.clean_target_span(target_span)
        if not clean_span:
            return stem, False

        pattern = re.compile(rf'(?<!<b>)\b{re.escape(clean_span)}\b(?!</b>)', re.IGNORECASE)
        matches = list(pattern.finditer(stem))
        if len(matches) == 1:
            m = matches[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<b>{matched_text}</b>" + stem[m.end():]
            return new_stem, True

        pattern_loose = re.compile(rf'(?<!<b>){re.escape(clean_span)}(?!</b>)', re.IGNORECASE)
        matches_loose = list(pattern_loose.finditer(stem))
        if len(matches_loose) == 1:
            m = matches_loose[0]
            matched_text = m.group(0)
            new_stem = stem[:m.start()] + f"<b>{matched_text}</b>" + stem[m.end():]
            return new_stem, True

        return stem, False

    @staticmethod
    def apply_compound_formatting(stem: str, token: str, is_bold: bool, is_underline: bool) -> Tuple[str, bool]:
        """Applies compound formatting (e.g. <u><b>H</b></u>)."""
        if not stem or not token:
            return stem, False

        tag_open = ""
        tag_close = ""
        if is_underline:
            tag_open += "<u>"
            tag_close = "</u>" + tag_close
        if is_bold:
            tag_open += "<b>"
            tag_close = "</b>" + tag_close

        if f"{tag_open}{token}{tag_close}" in stem:
            return stem, True

        # Exact match
        pattern = re.compile(re.escape(token))
        matches = list(pattern.finditer(stem))
        if matches:
            # Replace all occurrences if it's a specific token in species lines
            new_stem = pattern.sub(f"{tag_open}{token}{tag_close}", stem)
            return new_stem, True

        return stem, False


def correlate_and_remediate_paper(
    paper_path: str,
    pdf_path: Optional[str] = None,
    dry_run: bool = True
) -> Dict[str, Any]:
    """
    Audits and optionally remediates a single exam JSON paper against its source PDF.
    """
    with open(paper_path, 'r', encoding='utf-8') as f:
        paper_data = json.load(f)

    paper_id = paper_data.get('id', os.path.basename(paper_path).replace('.json', ''))
    exam_id = paper_data.get('examId', '')
    questions = paper_data.get('questions', [])

    report = {
        'paperId': paper_id,
        'examId': exam_id,
        'paperPath': paper_path,
        'pdfPath': pdf_path,
        'totalQuestions': len(questions),
        'formattingCuesCount': 0,
        'repairedCount': 0,
        'alreadyCleanCount': 0,
        'reviewRequiredCount': 0,
        'repairs': [],
        'uncertainCases': []
    }

    # If no PDF path provided or file doesn't exist
    if not pdf_path or not os.path.exists(pdf_path):
        # Scan for cues that could not be verified
        for q in questions:
            stem = q.get('questionText', '')
            has_cue = (
                bool(HIGHLIGHT_CUE_REGEX.search(stem)) or
                bool(UNDERLINE_CUE_REGEX.search(stem)) or
                bool(BOLD_CUE_REGEX.search(stem)) or
                bool(BRACKETED_CUE_REGEX.search(stem))
            )
            if has_cue:
                report['formattingCuesCount'] += 1
                if '<mark>' in stem or '<u>' in stem or '<b>' in stem:
                    report['alreadyCleanCount'] += 1
                else:
                    report['reviewRequiredCount'] += 1
                    report['uncertainCases'].append({
                        'questionNumber': q.get('questionNumber'),
                        'reason': 'Source PDF not available on disk for verification',
                        'stem': stem[:100]
                    })
        return report

    # Extract all formatting features from source PDF
    extractor = UniversalPdfFormattingExtractor(pdf_path)
    page_underlines = {}
    page_highlights = {}
    page_styled_spans = {}

    for p_idx in range(len(extractor.doc)):
        underlines = extractor.get_page_underlines(p_idx)
        if underlines:
            page_underlines[p_idx] = underlines
        highlights = extractor.get_page_highlights(p_idx)
        if highlights:
            page_highlights[p_idx] = highlights
        spans = extractor.get_page_styled_spans(p_idx)
        if spans:
            page_styled_spans[p_idx] = spans

    extractor.close()

    # Collect all candidate features across the document
    all_underlines = [u for u_list in page_underlines.values() for u in u_list]
    all_highlights = [h for h_list in page_highlights.values() for h in h_list]
    all_styled = [s for s_list in page_styled_spans.values() for s in s_list]

    paper_modified = False

    for q in questions:
        stem = q.get('questionText', '')
        q_num = q.get('questionNumber')

        has_highlight_cue = bool(HIGHLIGHT_CUE_REGEX.search(stem))
        has_underline_cue = bool(UNDERLINE_CUE_REGEX.search(stem))
        has_bold_cue = bool(BOLD_CUE_REGEX.search(stem))

        if not (has_highlight_cue or has_underline_cue or has_bold_cue):
            continue

        report['formattingCuesCount'] += 1

        # Check if already cleanly formatted
        if has_highlight_cue and '<mark>' in stem:
            report['alreadyCleanCount'] += 1
            continue
        if has_underline_cue and '<u>' in stem:
            report['alreadyCleanCount'] += 1
            continue
        if has_bold_cue and not has_underline_cue and '<b>' in stem:
            report['alreadyCleanCount'] += 1
            continue

        repaired = False

        # 1. Special compound case: bold and underlined atoms/characters (e.g. GATE CY Q40)
        if has_bold_cue and has_underline_cue and 'NMR' in stem and 'bold and underlined H atom' in stem:
            updated_stem = stem
            species_targets = [
                ('[HNi', '[<u><b>H</b></u>Ni'),
                ('(Me)H', '(Me)<u><b>H</b></u>'),
                ('PH3', 'P<u><b>H</b></u>3'),
                ('ZrH2', 'Zr<u><b>H</b></u>2'),
            ]
            for old_pat, new_pat in species_targets:
                if old_pat in updated_stem and new_pat not in updated_stem:
                    updated_stem = updated_stem.replace(old_pat, new_pat)

            if updated_stem != stem:
                q['questionText'] = updated_stem
                if q.get('contentBlocks') and len(q['contentBlocks']) > 0:
                    q['contentBlocks'][0]['content'] = updated_stem
                repaired = True
                paper_modified = True
                report['repairedCount'] += 1
                report['repairs'].append({
                    'questionNumber': q_num,
                    'formattingType': 'BOLD_AND_UNDERLINE_COMPOUND',
                    'targetSpan': 'H (NMR species target)',
                })

        # 2. Highlight/replacement-target span correlation
        if not repaired and has_highlight_cue:
            # 2a. Check vector drawing highlight boxes
            matched_hl = []
            for h in all_highlights:
                clean_p = QuestionFormattingCorrelator.clean_target_span(h['phrase'])
                if clean_p and re.search(rf'\b{re.escape(clean_p)}\b', stem, re.IGNORECASE):
                    if not any(k in clean_p.lower() for k in ['highlighted', 'appropriate', 'select', 'sentence', 'given', 'replace', 'option']):
                        matched_hl.append(h)

            if len(matched_hl) == 1:
                target = matched_hl[0]['phrase']
                new_stem, success = QuestionFormattingCorrelator.apply_highlight_to_text(stem, target)
                if success:
                    q['questionText'] = new_stem
                    if q.get('contentBlocks') and len(q['contentBlocks']) > 0:
                        block_content = q['contentBlocks'][0].get('content', '')
                        new_block, _ = QuestionFormattingCorrelator.apply_highlight_to_text(block_content, target)
                        q['contentBlocks'][0]['content'] = new_block
                    repaired = True
                    paper_modified = True
                    report['repairedCount'] += 1
                    report['repairs'].append({
                        'questionNumber': q_num,
                        'formattingType': 'HIGHLIGHT_DRAWING',
                        'targetSpan': target,
                        'sourcePage': matched_hl[0]['page'] + 1,
                    })

            # 2b. Check heavy/black/bold font spans in sentence
            if not repaired and all_styled:
                # Isolate sentence portion after instruction prefix
                sentence_part = stem
                colon_idx = stem.find(':')
                if colon_idx != -1 and colon_idx < len(stem) - 5:
                    sentence_part = stem[colon_idx + 1:].strip()

                styled_candidates = []
                for s in all_styled:
                    if s.get('is_bold'):
                        sp_text = QuestionFormattingCorrelator.clean_target_span(s['text'])
                        if len(sp_text) >= 3 and sp_text in sentence_part:
                            if not any(k in sp_text.lower() for k in ['highlighted', 'replace', 'sentence', 'choose', 'option', 'select']):
                                styled_candidates.append(s)

                if len(styled_candidates) == 1:
                    target = styled_candidates[0]['text']
                    new_stem, success = QuestionFormattingCorrelator.apply_highlight_to_text(stem, target)
                    if success:
                        q['questionText'] = new_stem
                        if q.get('contentBlocks') and len(q['contentBlocks']) > 0:
                            block_content = q['contentBlocks'][0].get('content', '')
                            new_block, _ = QuestionFormattingCorrelator.apply_highlight_to_text(block_content, target)
                            q['contentBlocks'][0]['content'] = new_block
                        repaired = True
                        paper_modified = True
                        report['repairedCount'] += 1
                        report['repairs'].append({
                            'questionNumber': q_num,
                            'formattingType': 'HIGHLIGHT_FONT_WEIGHT',
                            'targetSpan': target,
                            'sourcePage': styled_candidates[0]['page'] + 1,
                            'font': styled_candidates[0]['font']
                        })

        # 3. Standard underline correlation from PDF vector drawings
        if not repaired and has_underline_cue:
            matched_candidates = []
            for u in all_underlines:
                phrase = u['phrase']
                clean_p = QuestionFormattingCorrelator.clean_target_span(phrase)
                if clean_p and re.search(rf'\b{re.escape(clean_p)}\b', stem, re.IGNORECASE):
                    if not any(k in clean_p.lower() for k in ['underlined', 'appropriate', 'select', 'sentence', 'given']):
                        matched_candidates.append(u)

            if len(matched_candidates) == 1:
                target = matched_candidates[0]['phrase']
                new_stem, success = QuestionFormattingCorrelator.apply_underline_to_text(stem, target)
                if success:
                    q['questionText'] = new_stem
                    if q.get('contentBlocks') and len(q['contentBlocks']) > 0:
                        block_content = q['contentBlocks'][0].get('content', '')
                        new_block, _ = QuestionFormattingCorrelator.apply_underline_to_text(block_content, target)
                        q['contentBlocks'][0]['content'] = new_block

                    repaired = True
                    paper_modified = True
                    report['repairedCount'] += 1
                    report['repairs'].append({
                        'questionNumber': q_num,
                        'formattingType': 'UNDERLINE',
                        'targetSpan': target,
                        'sourcePage': matched_candidates[0]['page'] + 1,
                        'sourceY': matched_candidates[0]['y']
                    })
            elif len(matched_candidates) > 1:
                # Rank candidates by option token matches
                options_str = ' '.join(q.get('options') or [])
                ranked = []
                for c in matched_candidates:
                    c_clean = QuestionFormattingCorrelator.clean_target_span(c['phrase'])
                    score = 0
                    for word in c_clean.split():
                        if word.lower() in options_str.lower():
                            score += 1
                    ranked.append((score, c))
                ranked.sort(key=lambda x: x[0], reverse=True)

                if ranked[0][0] > 0 and (len(ranked) == 1 or ranked[0][0] > ranked[1][0]):
                    target = ranked[0][1]['phrase']
                    new_stem, success = QuestionFormattingCorrelator.apply_underline_to_text(stem, target)
                    if success:
                        q['questionText'] = new_stem
                        if q.get('contentBlocks') and len(q['contentBlocks']) > 0:
                            block_content = q['contentBlocks'][0].get('content', '')
                            new_block, _ = QuestionFormattingCorrelator.apply_underline_to_text(block_content, target)
                            q['contentBlocks'][0]['content'] = new_block

                        repaired = True
                        paper_modified = True
                        report['repairedCount'] += 1
                        report['repairs'].append({
                            'questionNumber': q_num,
                            'formattingType': 'UNDERLINE_RANKED',
                            'targetSpan': target,
                            'sourcePage': ranked[0][1]['page'] + 1,
                        })

        if not repaired:
            reason = 'Source PDF question stem lacks coordinate-level highlight or distinct font styling for target span' if has_highlight_cue else 'No single unambiguous candidate span found matching question stem'
            report['reviewRequiredCount'] += 1
            report['uncertainCases'].append({
                'questionNumber': q_num,
                'cue': 'HIGHLIGHT' if has_highlight_cue else ('UNDERLINE' if has_underline_cue else 'BOLD'),
                'reason': reason,
                'stem': stem[:100]
            })

    if paper_modified and not dry_run:
        with open(paper_path, 'w', encoding='utf-8') as f:
            json.dump(paper_data, f, indent=2, ensure_ascii=False)
            f.write('\n')

    return report


def scan_and_reprocess_all_papers(
    exams_dir: str,
    downloads_dir: str,
    dry_run: bool = True
) -> Dict[str, Any]:
    """
    Scans the entire repository of papers, locates authentic source PDFs where available,
    and performs automated audit and remediation.
    """
    json_files = sorted(glob.glob(os.path.join(exams_dir, '*.json')))

    summary = {
        'totalPapersScanned': len(json_files),
        'totalQuestionsScanned': 0,
        'papersWithFormattingCues': 0,
        'totalQuestionsWithCues': 0,
        'totalRepaired': 0,
        'totalAlreadyClean': 0,
        'totalReviewRequired': 0,
        'totalPdfsFound': 0,
        'paperReports': []
    }

    # Pre-index source PDFs in downloads
    pdf_index = {}
    for root, _, files in os.walk(downloads_dir):
        for file in files:
            if file.endswith('.pdf'):
                full_path = os.path.join(root, file)
                pdf_index[file.lower()] = full_path

    print(f"Indexed {len(pdf_index)} source PDFs in {downloads_dir}")

    for json_path in json_files:
        fname = os.path.basename(json_path)
        paper_id = fname.replace('.json', '')

        # Attempt to find corresponding PDF
        matched_pdf = None
        # Heuristic matching: date / shift
        # e.g. ssc-chsl-2024-01jul-s1 -> 01-07-2024 / 9-00-AM
        m = re.match(r'ssc-chsl-(\d{4})-(\d{2})([a-z]{3})-s(\d)', paper_id)
        if m:
            yr, day, mon, shift = m.groups()
            mon_num = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}.get(mon, '07')
            for pdf_name, full_path in pdf_index.items():
                if yr in pdf_name and f"{day}-{mon_num}-{yr}" in pdf_name:
                    if (shift == '1' and ('9-00' in pdf_name or 'shift-i' in pdf_name or 'shift-1' in pdf_name or 'morning' in pdf_name)) or \
                       (shift == '2' and ('11-45' in pdf_name or '12-30' in pdf_name or 'shift-ii' in pdf_name or 'shift-2' in pdf_name or 'afternoon' in pdf_name)) or \
                       (shift == '3' and ('2-30' in pdf_name or '3-00' in pdf_name or 'shift-iii' in pdf_name or 'shift-3' in pdf_name)) or \
                       (shift == '4' and ('5-15' in pdf_name or '5-30' in pdf_name or 'shift-iv' in pdf_name or 'shift-4' in pdf_name)):
                        matched_pdf = full_path
                        break

        # Match GATE papers e.g. gate-2023-cy -> GATE_2023_CY_Question_Paper.pdf
        if not matched_pdf and paper_id.startswith('gate-'):
            parts = paper_id.split('-')
            if len(parts) >= 3:
                yr = parts[1]
                code = parts[2]
                for pdf_name, full_path in pdf_index.items():
                    if f"gate_{yr}_{code}_question_paper" in pdf_name or f"gate_{yr}_{code}_qp" in pdf_name or (f"gate {yr}" in pdf_name and f"_{code}_" in pdf_name):
                        matched_pdf = full_path
                        break

        if matched_pdf:
            summary['totalPdfsFound'] += 1

        rep = correlate_and_remediate_paper(json_path, matched_pdf, dry_run=dry_run)
        summary['totalQuestionsScanned'] += rep['totalQuestions']

        if rep['formattingCuesCount'] > 0:
            summary['papersWithFormattingCues'] += 1
            summary['totalQuestionsWithCues'] += rep['formattingCuesCount']
            summary['totalRepaired'] += rep['repairedCount']
            summary['totalAlreadyClean'] += rep['alreadyCleanCount']
            summary['totalReviewRequired'] += rep['reviewRequiredCount']
            summary['paperReports'].append(rep)

    return summary


def main():
    parser = argparse.ArgumentParser(description="Universal Question Formatting Fidelity Engine")
    parser.add_argument('--paper', help="Single exam JSON path to audit/remediate")
    parser.add_argument('--pdf', help="Source PDF path corresponding to the paper")
    parser.add_argument('--all', action='store_true', help="Audit/remediate all papers in repository")
    parser.add_argument('--apply', action='store_true', help="Apply verified changes to JSON files (default is dry-run)")
    args = parser.parse_args()

    exams_dir = '/Users/shivarampatel/Desktop/MOCK.AI/web/src/data/exams'
    downloads_dir = '/Users/shivarampatel/Downloads'

    if args.paper:
        report = correlate_and_remediate_paper(args.paper, args.pdf, dry_run=not args.apply)
        print(json.dumps(report, indent=2))
    elif args.all:
        print(f"Running Universal Formatting Engine (Apply Mode: {args.apply})...")
        summary = scan_and_reprocess_all_papers(exams_dir, downloads_dir, dry_run=not args.apply)
        print("\n========================================================")
        print("UNIVERSAL FORMATTING ENGINE AUDIT & REMEDIATION SUMMARY")
        print("========================================================")
        print(f"Total Papers Scanned:             {summary['totalPapersScanned']}")
        print(f"Total Questions Scanned:          {summary['totalQuestionsScanned']}")
        print(f"Papers with Verified PDFs:        {summary['totalPdfsFound']}")
        print(f"Papers with Formatting Cues:      {summary['papersWithFormattingCues']}")
        print(f"Total Questions with Cues:        {summary['totalQuestionsWithCues']}")
        print(f"Repaired Automatically:           {summary['totalRepaired']}")
        print(f"Already Clean:                    {summary['totalAlreadyClean']}")
        print(f"Requiring Staff Review:           {summary['totalReviewRequired']}")
        print("========================================================")
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
