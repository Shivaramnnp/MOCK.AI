"""
scripts/ssc_engine_v4/geometry.py

Universal Page Geometry Engine.
Provides coordinate transformations, reading order sorting, boundary clamping,
and non-content exclusion for PDF pages.
"""

from typing import List, Dict, Any, Tuple, Optional
import fitz

# Known publisher promotional banner, header stamp, and watermark dimensions (width, height)
AD_SIZES = {
    (464, 137),   # Adda247 header logo
    (2022, 423),  # Adda247 top banner
    (834, 719),   # Adda247 background watermark
    (833, 719),
    (835, 719),
    (143, 98),    # 2025 banner logo
    (200, 95),    # 2025 banner logo
    (523, 451),   # 2025 watermark/banner
    (1023, 1537), # 2025 full-page promo
    (596, 842),   # 2025 page background
    (466, 149),
    (423, 142),
}

# TCS iON Status Column Icons (ticks, crosses, radio buttons)
ICON_SIZES = {
    (16, 16),     # Standard green tick
    (31, 21),     # Standard red cross
    (23, 22),     # 2023 green tick
    (23, 23),     # 2023 green tick variant
    (18, 21),
    (19, 22),
}

def is_publisher_ad(w: int, h: int) -> bool:
    """Returns True if the image dimensions correspond to a known publisher ad or watermark."""
    return (w, h) in AD_SIZES

def is_status_icon(w: int, h: int) -> bool:
    """Returns True if image dimensions match CBT response status icons (tick, cross, radio)."""
    return (w, h) in ICON_SIZES

def sort_reading_order(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sorts PDF elements strictly in physical 2D reading order:
    Primary: Page number
    Secondary: Vertical Y coordinate (rounded to 1pt tolerance)
    Tertiary: Horizontal X coordinate
    """
    return sorted(blocks, key=lambda b: (b['page'], round(b['pos'][1], 1), round(b['bbox'][0] if 'bbox' in b else 0.0, 1)))

def clamp_question_interval(
    cur_pos: Tuple[int, float],
    prev_pos: Optional[Tuple[int, float]],
    next_pos: Optional[Tuple[int, float]],
    upward_tolerance: float = 0.0
) -> Tuple[Tuple[int, float], Tuple[int, float]]:
    """
    Calculates strict start and end boundary positions for a question.
    GUARANTEES that upward tolerance never crosses into the previous question's boundary
    and that the end boundary never exceeds the next question's start position.
    """
    cur_page, cur_y = cur_pos
    
    # 1. Start boundary calculation with strict clamping
    if prev_pos is not None:
        prev_page, prev_y = prev_pos
        if prev_page == cur_page:
            # Same page: clamped strictly above prev_y + 1.0
            start_y = max(prev_y + 1.0, cur_y - upward_tolerance)
        else:
            # Different page: upward tolerance allowed up to top margin
            start_y = max(50.0, cur_y - upward_tolerance)
    else:
        start_y = max(50.0, cur_y - upward_tolerance)
        
    start_boundary = (cur_page, start_y)
    
    # 2. End boundary calculation
    if next_pos is not None:
        next_page, next_y = next_pos
        # Clamped strictly before next question start
        end_boundary = (next_page, next_y)
    else:
        end_boundary = (9999, 99999.0)
        
    return start_boundary, end_boundary

def is_image_in_interval(
    img_rect: Any,
    img_page: int,
    start_pos: Tuple[int, float],
    end_pos: Tuple[int, float]
) -> bool:
    """
    Determines whether an image belongs to the question interval [start_pos, end_pos)
    using the image's vertical midpoint y_mid.
    Guarantees that an image extending primarily into the NEXT question
    is never captured by the PREVIOUS question.
    """
    y_mid = (img_rect.y0 + img_rect.y1) / 2.0
    img_mid_pos = (img_page, y_mid)
    return start_pos <= img_mid_pos < end_pos

