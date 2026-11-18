"""
scripts/ssc_engine_v4/region_model.py

Universal Question Region and Object Ownership Model for Competitive Exam Ingestion.
Provides strict 2D geometric encapsulation, provenance metadata, and source classification.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple, Optional


class SourceRepresentation(str, Enum):
    """Source representation format detected on the original PDF page."""
    NATIVE_TEXT = "NATIVE_TEXT"          # Prompt and options are native vector font text
    RASTER_BANNER = "RASTER_BANNER"      # Prompt and/or options are raster image banners (XObjects)
    MIXED = "MIXED"                      # Mixed text instructions with embedded raster equation/figure
    GENUINE_VISUAL = "GENUINE_VISUAL"    # Non-verbal visual reasoning (mirror, series, paper fold, cube, dice)
    UNKNOWN = "UNKNOWN"


class ObjectRole(str, Enum):
    """Semantic role of an extracted PDF object."""
    QUESTION_HEADER = "QUESTION_HEADER"  # Q.N text anchor
    STEM_TEXT = "STEM_TEXT"              # Prompt sentence text
    STEM_BANNER = "STEM_BANNER"          # Raster prompt banner (e.g. 680x36 px)
    STEM_DIAGRAM = "STEM_DIAGRAM"        # Genuine question diagram/figure
    OPTION_LABEL = "OPTION_LABEL"        # 1., 2., 3., 4. text marker
    OPTION_TEXT = "OPTION_TEXT"          # Native text option choice
    OPTION_BANNER = "OPTION_BANNER"      # Small alphanumeric raster option chip (e.g. 'EUOT', '57')
    OPTION_IMAGE = "OPTION_IMAGE"        # Visual reasoning option choice figure
    STATUS_ICON = "STATUS_ICON"          # Selection icon (green tick, red cross, radio button)
    QUESTION_FOOTER = "QUESTION_FOOTER"  # Question ID : \d+, Status, Chosen Option box
    SECTION_HEADER = "SECTION_HEADER"    # Section : \w+ banner
    PASSAGE_TEXT = "PASSAGE_TEXT"        # Reading comprehension passage
    PUBLISHER_AD = "PUBLISHER_AD"        # Promotional watermark/banner to discard
    DECORATIVE = "DECORATIVE"            # Border lines, bullets


@dataclass
class ExtractedObject:
    """An individual extracted text block or image XObject with full geometric provenance."""
    page: int
    bbox: Tuple[float, float, float, float]  # (x0, y0, x1, y1)
    center: Tuple[float, float]              # (x_mid, y_mid)
    source_order: int                        # Sequence index in PyMuPDF extraction
    obj_type: str                            # 'text' | 'image'
    content: Optional[str] = None            # Text string (for text) or OCR text (for image)
    meta: Optional[Dict[str, Any]] = None    # Image metadata (xref, width, height, ext, etc.)
    role: ObjectRole = ObjectRole.DECORATIVE
    owner_question: Optional[int] = None     # 1-indexed overall question number
    owner_option: Optional[int] = None       # 0, 1, 2, 3 for options A, B, C, D


@dataclass
class QuestionRegion:
    """
    Geometry-Aware Question Region.
    Encapsulates a single examination question bounded by an evidence-based top anchor
    and a hard-floor bottom anchor (Question ID footer).
    """
    paper_id: str
    page: int                                                    # Primary starting page
    section_id: str
    question_number: int                                         # 1-indexed overall question number
    header_anchor: Tuple[float, float, float, float]             # bbox of 'Q.N'
    content_start: Tuple[int, float]                             # (page, y_start) with tolerance
    footer_anchor: Optional[Tuple[float, float, float, float]]    # bbox of 'Question ID : \d+'
    content_end: Tuple[int, float]                               # (page, y_end) clamped at footer
    source_bbox: Tuple[float, float, float, float]               # (x0, y0, x1, y1) bounding region
    section_name: str = ""
    confidence: str = "VERIFIED"                                 # VERIFIED | HIGH | REVIEW_REQUIRED
    segmentation_method: str = "DUAL_ANCHOR_FOOTER_CLAMPED"
    representation: SourceRepresentation = SourceRepresentation.UNKNOWN
    end_page: int = field(default=0)
    ans_pos: Optional[Tuple[int, float]] = None                  # (page, y) of 'Ans' block
    objects: List[ExtractedObject] = field(default_factory=list)

    def __post_init__(self):
        if self.end_page == 0:
            self.end_page = self.page

    def contains_point(self, page: int, y: float) -> bool:
        """Checks if a point (page, y) lies inside this question's multi-page bounding interval."""
        if page < self.page or page > self.end_page:
            return False
        if self.page == self.end_page:
            return self.content_start[1] <= y <= self.content_end[1]
        if page == self.page:
            return y >= self.content_start[1]
        if page == self.end_page:
            return y <= self.content_end[1]
        return True  # Intermediate page entirely within region
