"""
scripts/ssc_engine_v4/verifier.py

Forensic Verification Engine and Quality Gate.
Evaluates question completeness, asset integrity, answer validity, and assign verificationStatus.
"""

from typing import Dict, Any, List, Tuple
from scripts.ssc_engine_v4.asset_engine import AssetEngine
from scripts.ssc_engine_v4.option_engine import OptionDuplicateDetector

class QuestionVerificationGate:
    """
    Evaluates individual questions against production acceptance criteria.
    """
    MOJIBAKE_CHARS = set("ȵÏȷȺƺȹƽÔÖÕÛÜÝþÊæɇàͧͬçéèêíìîóòôúùûāēīōūšžćč")

    @staticmethod
    def verify_question(
        q_obj: Dict[str, Any],
        asset_engine: AssetEngine
    ) -> Tuple[str, List[str]]:
        """
        Validates question data.
        Returns (status, list_of_defects).
        status is 'VERIFIED', 'REVIEW_REQUIRED', or 'FAILED'.
        """
        defects = []

        q_num = q_obj.get("questionNumber", 0)
        stem_text = (q_obj.get("questionText") or "").strip()
        diag_url = q_obj.get("diagramUrl")
        diag_urls = q_obj.get("diagramUrls") or ([diag_url] if diag_url else [])
        options = q_obj.get("options") or []
        option_images = q_obj.get("optionImages") or [None, None, None, None]
        correct_ans = q_obj.get("correctAnswer")
        correct_idx = q_obj.get("correctAnswerIndex")

        # 1. Stem completeness & placeholder detection
        if not stem_text and not diag_url:
            defects.append(f"Q{q_num}: Completely missing stem text and diagram")
        elif "omitted in official" in stem_text or "[Question text" in stem_text:
            defects.append(f"Q{q_num}: Placeholder or omitted stem detected")

        # 1b. Stem encoding & OCR corruption detection
        found_mojibake = [c for c in stem_text if c in QuestionVerificationGate.MOJIBAKE_CHARS]
        if found_mojibake:
            defects.append(f"Q{q_num}: Mojibake characters detected in stem: {set(found_mojibake)}")
        if "@" in stem_text or "CS s" in stem_text:
            defects.append(f"Q{q_num}: OCR math corruption symbol detected in stem")

        # 2. Option slots count
        if len(options) != 4:
            defects.append(f"Q{q_num}: Expected exactly 4 options, found {len(options)}")

        # 3. Non-empty option contents & option mojibake
        for idx in range(min(4, len(options))):
            opt_t = options[idx].strip() if idx < len(options) else ""
            opt_img = option_images[idx] if idx < len(option_images) else None
            if not opt_t and not opt_img:
                defects.append(f"Q{q_num}: Option slot {idx} is empty (no text, no image)")
            elif opt_t:
                opt_moji = [c for c in opt_t if c in QuestionVerificationGate.MOJIBAKE_CHARS]
                if opt_moji:
                    defects.append(f"Q{q_num}: Mojibake detected in option slot {idx}: {set(opt_moji)}")

        # 4. Duplicate option detection
        is_distinct, dup_reason = OptionDuplicateDetector.audit_options(options, option_images)
        if not is_distinct:
            defects.append(f"Q{q_num}: {dup_reason}")

        # 5. Answer key range
        if correct_ans not in ['A', 'B', 'C', 'D'] or correct_idx not in [0, 1, 2, 3]:
            defects.append(f"Q{q_num}: Invalid answer key ({correct_ans}, index {correct_idx})")

        # 6. Single-ownership invariant
        is_single_owned, owner_reason = AssetEngine.verify_single_ownership(diag_urls, option_images, q_num)
        if not is_single_owned:
            defects.append(f"Q{q_num}: {owner_reason}")

        # 7. Asset filesystem existence audit
        for u in diag_urls:
            valid, reason = asset_engine.audit_filesystem_asset(u)
            if not valid:
                defects.append(f"Q{q_num}: Stem asset invalid: {reason}")

        for u in option_images:
            if u:
                valid, reason = asset_engine.audit_filesystem_asset(u)
                if not valid:
                    defects.append(f"Q{q_num}: Option asset invalid: {reason}")

        if defects:
            return "REVIEW_REQUIRED", defects
        return "VERIFIED", []
