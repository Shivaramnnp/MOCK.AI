"""
scripts/ssc_engine_v4/asset_engine.py

Asset Management and Cryptographic Provenance Engine.
Enforces the Single-Ownership Invariant and performs filesystem existence audits.
"""

import os
import hashlib
from typing import Dict, Any, List, Tuple, Set, Optional

class AssetEngine:
    """
    Manages image asset saving, deduplication, provenance tracking, and safety audits.
    """
    def __init__(self, public_assets_root: str):
        self.public_assets_root = public_assets_root
        self._content_hash_cache: Dict[str, str] = {}

    def get_or_save_asset(
        self,
        img_bytes: bytes,
        ext: str,
        dest_path: str,
        web_url: str
    ) -> str:
        """
        Saves image bytes to disk, deduplicating via SHA-256 hash.
        Returns the web-accessible URL.
        """
        h = hashlib.sha256(img_bytes).hexdigest()
        if h in self._content_hash_cache:
            return self._content_hash_cache[h]

        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with open(dest_path, 'wb') as f:
            f.write(img_bytes)

        self._content_hash_cache[h] = web_url
        return web_url

    @staticmethod
    def verify_single_ownership(
        diag_urls: List[str],
        opt_urls: List[Optional[str]],
        q_num: int
    ) -> Tuple[bool, str]:
        """
        Verifies the Single-Ownership Invariant:
        Stem assets and Option assets must have disjoint URL sets.
        """
        stem_set = set(diag_urls)
        opt_set = set(u for u in opt_urls if u)

        intersection = stem_set.intersection(opt_set)
        if intersection:
            return False, f"Single-ownership violation in Q{q_num}: Assets intersect {intersection}"

        # Naming convention validation
        for u in stem_set:
            if '_diag' not in u:
                return False, f"Invalid stem asset naming in Q{q_num}: {u}"

        for u in opt_set:
            if '_opt_' not in u:
                return False, f"Invalid option asset naming in Q{q_num}: {u}"

        return True, "Valid"

    def audit_filesystem_asset(self, web_url: str) -> Tuple[bool, str]:
        """
        Audits that a referenced web URL exists physically on disk,
        is readable, and has non-zero size.
        """
        if not web_url:
            return False, "Empty URL"

        # Map /exam-assets/... to public_assets_root
        rel_path = web_url.replace('/exam-assets/', '')
        abs_path = os.path.join(self.public_assets_root, rel_path)

        if not os.path.exists(abs_path):
            return False, f"File does not exist: {abs_path}"

        if not os.path.isfile(abs_path):
            return False, f"Not a regular file: {abs_path}"

        size = os.path.getsize(abs_path)
        if size == 0:
            return False, f"Zero-byte file: {abs_path}"

        return True, "Valid"
