"""
scripts/ssc_engine_v4

MOCK.AI Universal SSC Ingestion Engine (V4).
Modular, profile-driven question ingestion architecture for competitive exams.
"""

from scripts.ssc_engine_v4.profiles import (
    ScoringProfile,
    LayoutProfile,
    PaperProfile,
    SourceAdapter,
    SSCCHSL2023Tier1Profile,
    SSCCHSL2023Tier2Profile,
    SSCCHSL2024Tier1Profile,
    SSCCHSL2025Tier1Profile,
    SSCCGLTier1Profile,
    SSCMTSTier1Profile,
)
from scripts.ssc_engine_v4.geometry import (
    is_publisher_ad,
    is_status_icon,
    sort_reading_order,
    clamp_question_interval,
    is_image_in_interval,
    AD_SIZES,
    ICON_SIZES,
)
from scripts.ssc_engine_v4.classifier import (
    refine_diagram_crop,
    MultiSignalContentClassifier,
    VISUAL_KEYWORDS,
)
from scripts.ssc_engine_v4.option_engine import (
    clean_and_normalize_option_text,
    is_promotable_option_text,
    OptionSpatialMatcher,
    OptionDuplicateDetector,
)
from scripts.ssc_engine_v4.math_engine import MathEngine
from scripts.ssc_engine_v4.asset_engine import AssetEngine
from scripts.ssc_engine_v4.verifier import QuestionVerificationGate
from scripts.ssc_engine_v4.region_model import (
    SourceRepresentation,
    ObjectRole,
    ExtractedObject,
    QuestionRegion,
)
from scripts.ssc_engine_v4.segmentation import QuestionSegmentationEngine

__all__ = [
    "ScoringProfile",
    "LayoutProfile",
    "PaperProfile",
    "SourceAdapter",
    "SSCCHSL2023Tier1Profile",
    "SSCCHSL2023Tier2Profile",
    "SSCCHSL2024Tier1Profile",
    "SSCCHSL2025Tier1Profile",
    "SSCCGLTier1Profile",
    "SSCMTSTier1Profile",
    "is_publisher_ad",
    "is_status_icon",
    "sort_reading_order",
    "clamp_question_interval",
    "is_image_in_interval",
    "AD_SIZES",
    "ICON_SIZES",
    "refine_diagram_crop",
    "MultiSignalContentClassifier",
    "VISUAL_KEYWORDS",
    "clean_and_normalize_option_text",
    "is_promotable_option_text",
    "OptionSpatialMatcher",
    "OptionDuplicateDetector",
    "MathEngine",
    "AssetEngine",
    "QuestionVerificationGate",
    "SourceRepresentation",
    "ObjectRole",
    "ExtractedObject",
    "QuestionRegion",
    "QuestionSegmentationEngine",
]
