"""
scripts/ssc_engine_v4/profiles.py

Universal Paper Profile & Source Adapter System for SSC and Competitive Exam Ingestion.
Eliminates all year-specific branches ('if year == 2023') in core engine logic.
"""

import re
from typing import Tuple, Dict, Any, Optional

class ScoringProfile:
    """Encapsulates scoring parameters for an examination stage."""
    def __init__(self, marks_correct: float, marks_negative: float, duration_minutes: int):
        self.marks_correct = marks_correct
        self.marks_negative = marks_negative
        self.duration_minutes = duration_minutes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "marksCorrect": self.marks_correct,
            "marksNegative": self.marks_negative,
            "durationMinutes": self.duration_minutes
        }


class LayoutProfile:
    """Encapsulates geometric coordinate boundaries for a CBT response sheet layout."""
    def __init__(
        self,
        col_bound: float,
        option_x_min: float = 78.0,
        option_x_max: float = 550.0,
        top_margin: float = 50.0,
        bottom_margin: float = 780.0,
        min_diagram_split_gap: float = 8.0,
        formula_upward_tolerance: float = 0.0
    ):
        self.col_bound = col_bound                    # Horizontal boundary separating content from status
        self.option_x_min = option_x_min              # Left margin of option area
        self.option_x_max = option_x_max              # Right margin of option area
        self.top_margin = top_margin                  # Header exclusion margin
        self.bottom_margin = bottom_margin            # Footer exclusion margin
        self.min_diagram_split_gap = min_diagram_split_gap  # Minimum whitespace gap to separate prompt text from figure
        self.formula_upward_tolerance = formula_upward_tolerance  # Strictly clamped upward tolerance (default 0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "colBound": self.col_bound,
            "optionXMin": self.option_x_min,
            "optionXMax": self.option_x_max,
            "topMargin": self.top_margin,
            "bottomMargin": self.bottom_margin,
            "minDiagramSplitGap": self.min_diagram_split_gap
        }


class PaperProfile:
    """Base class for all exam and year-specific layout and parsing profiles."""
    def __init__(
        self,
        profile_id: str,
        exam_id: str,
        exam_name: str,
        tier: str,
        year: int,
        layout: LayoutProfile,
        scoring: ScoringProfile,
        expected_questions: int,
        section_count: int
    ):
        self.profile_id = profile_id
        self.exam_id = exam_id
        self.exam_name = exam_name
        self.tier = tier
        self.year = year
        self.layout = layout
        self.scoring = scoring
        self.expected_questions = expected_questions
        self.section_count = section_count

    def identify_section(self, header_text: str) -> Tuple[str, str]:
        """Maps raw section header string from PDF to canonical (section_id, section_name)."""
        sec_raw = header_text.split(':')[-1].strip().lower()
        if 'intelligence' in sec_raw or 'reasoning' in sec_raw:
            return 'reasoning', 'General Intelligence & Reasoning'
        elif 'quantitative' in sec_raw or 'quant' in sec_raw or 'numerical' in sec_raw:
            return 'quant', 'Quantitative Aptitude'
        elif 'awareness' in sec_raw or 'knowledge' in sec_raw and 'computer' not in sec_raw:
            return 'general_awareness', 'General Awareness'
        elif 'english' in sec_raw or 'comprehension' in sec_raw and 'reasoning' not in sec_raw:
            return 'english', 'English Language'
        elif 'mathematical' in sec_raw or 'mathematics' in sec_raw:
            return 'quant', 'Mathematical Abilities'
        elif 'computer' in sec_raw:
            return 'computer', 'Computer Knowledge Module'
        return 'general', 'General'


class SSCCHSL2023Tier1Profile(PaperProfile):
    """Profile for SSC CHSL 2023 Tier 1 CBT response sheets."""
    def __init__(self):
        super().__init__(
            profile_id="ssc-chsl-2023-tier1",
            exam_id="ssc-chsl",
            exam_name="SSC Combined Higher Secondary Level (CHSL)",
            tier="Tier 1",
            year=2023,
            layout=LayoutProfile(col_bound=98.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=2.0, marks_negative=0.5, duration_minutes=60),
            expected_questions=100,
            section_count=4
        )


class SSCCHSL2023Tier2Profile(PaperProfile):
    """Profile for SSC CHSL 2023 Tier 2 CBT response sheets."""
    def __init__(self):
        super().__init__(
            profile_id="ssc-chsl-2023-tier2",
            exam_id="ssc-chsl",
            exam_name="SSC Combined Higher Secondary Level (CHSL)",
            tier="Tier 2",
            year=2023,
            layout=LayoutProfile(col_bound=146.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=3.0, marks_negative=1.0, duration_minutes=135),
            expected_questions=135,
            section_count=5
        )


class SSCCHSL2024Tier1Profile(PaperProfile):
    """Profile for SSC CHSL 2024 Tier 1 CBT response sheets."""
    def __init__(self):
        super().__init__(
            profile_id="ssc-chsl-2024-tier1",
            exam_id="ssc-chsl",
            exam_name="SSC Combined Higher Secondary Level (CHSL)",
            tier="Tier 1",
            year=2024,
            layout=LayoutProfile(col_bound=98.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=2.0, marks_negative=0.5, duration_minutes=60),
            expected_questions=100,
            section_count=4
        )


class SSCCHSL2025Tier1Profile(PaperProfile):
    """Profile for SSC CHSL 2025 Tier 1 CBT response sheets."""
    def __init__(self):
        super().__init__(
            profile_id="ssc-chsl-2025-tier1",
            exam_id="ssc-chsl",
            exam_name="SSC Combined Higher Secondary Level (CHSL)",
            tier="Tier 1",
            year=2025,
            layout=LayoutProfile(col_bound=98.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=2.0, marks_negative=0.5, duration_minutes=60),
            expected_questions=100,
            section_count=4
        )


class SSCCGLTier1Profile(PaperProfile):
    """Profile for SSC CGL Tier 1 CBT response sheets."""
    def __init__(self, year: int = 2024):
        super().__init__(
            profile_id=f"ssc-cgl-{year}-tier1",
            exam_id="ssc-cgl",
            exam_name="SSC Combined Graduate Level (CGL)",
            tier="Tier 1",
            year=year,
            layout=LayoutProfile(col_bound=98.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=2.0, marks_negative=0.5, duration_minutes=60),
            expected_questions=100,
            section_count=4
        )


class SSCMTSTier1Profile(PaperProfile):
    """Profile for SSC MTS CBT response sheets."""
    def __init__(self, year: int = 2024):
        super().__init__(
            profile_id=f"ssc-mts-{year}-tier1",
            exam_id="ssc-mts",
            exam_name="SSC Multi-Tasking Staff (MTS)",
            tier="Tier 1",
            year=year,
            layout=LayoutProfile(col_bound=98.0, min_diagram_split_gap=8.0),
            scoring=ScoringProfile(marks_correct=3.0, marks_negative=1.0, duration_minutes=90),
            expected_questions=90,
            section_count=4
        )


class SourceAdapter:
    """
    Source Adapter Router that inspects document metadata, filename, and page headers
    to dynamically resolve the authoritative PaperProfile.
    """
    _REGISTRY: Dict[str, PaperProfile] = {
        "ssc-chsl-2023-tier1": SSCCHSL2023Tier1Profile(),
        "ssc-chsl-2023-tier2": SSCCHSL2023Tier2Profile(),
        "ssc-chsl-2024-tier1": SSCCHSL2024Tier1Profile(),
        "ssc-chsl-2025-tier1": SSCCHSL2025Tier1Profile(),
        "ssc-cgl-2024-tier1": SSCCGLTier1Profile(2024),
        "ssc-cgl-2025-tier1": SSCCGLTier1Profile(2025),
        "ssc-mts-2024-tier1": SSCMTSTier1Profile(2024),
        "ssc-mts-2025-tier1": SSCMTSTier1Profile(2025),
    }

    @classmethod
    def resolve_profile(cls, filename: str, header_text: str = "") -> PaperProfile:
        """
        Determines the appropriate PaperProfile from filename and header cues.
        Defaults cleanly without breaking if layout variations are detected.
        """
        fn = filename.lower()
        hdr = header_text.lower()

        # 1. Determine Tier
        is_tier2 = ('tier2' in fn or 'tier 2' in fn or 'tier-2' in fn or 'tier-ii' in fn or
                    'tier 2' in hdr or 'tier-2' in hdr or 'tier ii' in hdr or 'module' in hdr)
        tier = "Tier 2" if is_tier2 else "Tier 1"

        # 2. Determine Exam Type
        if 'cgl' in fn or 'combined graduate' in hdr:
            exam_type = 'cgl'
        elif 'mts' in fn or 'multi tasking' in hdr or 'multi-tasking' in hdr:
            exam_type = 'mts'
        else:
            exam_type = 'chsl'

        # 3. Determine Year
        year_match = re.search(r'\b(2019|2020|2021|2022|2023|2024|2025|2026)\b', fn)
        year = int(year_match.group(1)) if year_match else 2023

        # 4. Form Profile Key
        profile_key = f"ssc-{exam_type}-{year}-{tier.lower().replace(' ', '')}"
        if profile_key in cls._REGISTRY:
            return cls._REGISTRY[profile_key]

        # Dynamic fallback construction based on tier
        if is_tier2:
            return SSCCHSL2023Tier2Profile()
        return SSCCHSL2023Tier1Profile()
