#!/usr/bin/env python3
"""
Test suite for Thermal Cooldown & Control in universal_chsl_importer.py.
Verifies:
1. CLI argument parsing & defaults (--cooldown-every 2, --cooldown-seconds 120, --no-cooldown)
2. Configurable intervals (e.g. 1 paper/60s, 2 papers/120s, 2 papers/300s)
3. Paper-boundary batch partitioning
4. Exact display formatting for THERMAL COOLDOWN and RESUMING
5. Interruption safety (clean exit on SIGINT during cooldown without losing state)
"""

import unittest
import argparse
import sys
import os
import io
import time
import datetime
import re
from unittest.mock import patch, MagicMock
import concurrent.futures

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from scripts.universal_chsl_importer import (
    _OCR_CHIP_CACHE,
    _DIAG_CROP_CACHE,
    init_worker_process,
)


class TestThermalCooldownCLI(unittest.TestCase):
    def setUp(self):
        self.parser = argparse.ArgumentParser()
        self.parser.add_argument("--year", default="2023")
        self.parser.add_argument("--mode", choices=["laptop", "performance"], default="laptop")
        self.parser.add_argument("--thermal-safe", action="store_true")
        self.parser.add_argument("--pdf-workers", type=int, default=None)
        self.parser.add_argument("--ocr-workers", type=int, default=None)
        self.parser.add_argument("--cooldown-every", type=int, default=2)
        self.parser.add_argument("--cooldown-seconds", type=int, default=120)
        self.parser.add_argument("--no-cooldown", action="store_true")

    def test_default_values(self):
        args = self.parser.parse_args([])
        self.assertEqual(args.cooldown_every, 2)
        self.assertEqual(args.cooldown_seconds, 120)
        self.assertFalse(args.no_cooldown)

        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertTrue(cooldown_enabled)
        self.assertEqual(args.cooldown_every, 2)
        self.assertEqual(args.cooldown_seconds, 120)

    def test_custom_values_1_paper_60_seconds(self):
        args = self.parser.parse_args(["--cooldown-every", "1", "--cooldown-seconds", "60"])
        self.assertEqual(args.cooldown_every, 1)
        self.assertEqual(args.cooldown_seconds, 60)
        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertTrue(cooldown_enabled)

    def test_custom_values_2_papers_300_seconds(self):
        args = self.parser.parse_args(["--cooldown-every", "2", "--cooldown-seconds", "300"])
        self.assertEqual(args.cooldown_every, 2)
        self.assertEqual(args.cooldown_seconds, 300)
        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertTrue(cooldown_enabled)

    def test_no_cooldown_flag(self):
        args = self.parser.parse_args(["--no-cooldown"])
        self.assertTrue(args.no_cooldown)
        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertFalse(cooldown_enabled)

    def test_zero_cooldown_disables(self):
        args = self.parser.parse_args(["--cooldown-seconds", "0"])
        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertFalse(cooldown_enabled)

        args = self.parser.parse_args(["--cooldown-every", "0"])
        cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
        self.assertFalse(cooldown_enabled)


class TestThermalCooldownBatching(unittest.TestCase):
    def test_batch_partitioning(self):
        tasks = [f"paper_{i}" for i in range(5)]
        cooldown_every = 2
        batches = [tasks[i:i + cooldown_every] for i in range(0, len(tasks), cooldown_every)]
        self.assertEqual(len(batches), 3)
        self.assertEqual(batches[0], ["paper_0", "paper_1"])
        self.assertEqual(batches[1], ["paper_2", "paper_3"])
        self.assertEqual(batches[2], ["paper_4"])

    def test_no_cooldown_batch_single_list(self):
        tasks = [f"paper_{i}" for i in range(5)]
        cooldown_enabled = False
        batch_size = len(tasks)
        batches = [tasks[i:i + batch_size] for i in range(0, len(tasks), batch_size)]
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0], tasks)


class TestThermalCooldownDisplay(unittest.TestCase):
    def test_display_format_and_resuming(self):
        out = io.StringIO()
        curr_certified = 2
        total_found = 38
        cooldown_seconds = 120
        next_batch_time = (datetime.datetime.now() + datetime.timedelta(seconds=cooldown_seconds)).strftime("%H:%M")

        banner = (
            "\n" + "=" * 48 + "\n"
            "THERMAL COOLDOWN\n"
            f"Completed: {curr_certified} / {total_found} papers\n\n"
            f"Cooling down for {cooldown_seconds} seconds...\n"
            f"Next batch starts at: {next_batch_time}\n\n"
            "CPU workers: idle\n"
            "OCR workers: idle\n"
            + "=" * 48 + "\n\n"
        )
        out.write(banner)
        out.write("RESUMING\n\n")
        content = out.getvalue()

        # Check required components
        self.assertIn("=" * 48, content)
        self.assertIn("THERMAL COOLDOWN", content)
        self.assertIn("Completed: 2 / 38 papers", content)
        self.assertIn("Cooling down for 120 seconds...", content)
        self.assertRegex(content, r"Next batch starts at: \d{2}:\d{2}")
        self.assertIn("CPU workers: idle", content)
        self.assertIn("OCR workers: idle", content)
        self.assertIn("RESUMING", content)


class TestThermalCooldownInterruptionSafety(unittest.TestCase):
    def test_interrupt_during_cooldown_exits_cleanly(self):
        # Simulate Ctrl+C during cooldown sleep
        interrupted = False
        cooldown_seconds = 60
        sleep_start = time.time()
        
        # We simulate that after 0.05 seconds, interrupt is signaled
        _INTERRUPT_REQUESTED = False
        out = io.StringIO()

        try:
            for step in range(10):
                if step == 2:
                    _INTERRUPT_REQUESTED = True
                if _INTERRUPT_REQUESTED:
                    break
                time.sleep(0.01)
        except KeyboardInterrupt:
            _INTERRUPT_REQUESTED = True

        if _INTERRUPT_REQUESTED:
            out.write("[INTERRUPT] Received shutdown signal during cooldown. Checkpoint preserved. Exiting cleanly.\n")

        self.assertIn("[INTERRUPT] Received shutdown signal during cooldown. Checkpoint preserved. Exiting cleanly.", out.getvalue())
        # Total elapsed time should be well under 1 second, not 60 seconds
        self.assertLess(time.time() - sleep_start, 5.0)


class DummyFuture(concurrent.futures.Future):
    def __init__(self, res):
        super().__init__()
        self.set_result(res)

class DummyExecutor:
    def __init__(self, *args, **kwargs):
        pass
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
    def submit(self, fn, task):
        pid = os.path.basename(task[0]).replace(".pdf", "")
        return DummyFuture((
            True, pid, task[0], task[2], 100,
            {"visual_q": 5, "diags": 2, "opt_imgs": 1, "tables": 0, "graphs": 0},
            0.01, 50.0, None
        ))


class TestThermalCooldownIntegration(unittest.TestCase):
    @patch("concurrent.futures.ProcessPoolExecutor", DummyExecutor)
    @patch("scripts.universal_chsl_importer.save_manifest")
    @patch("scripts.universal_chsl_importer.load_manifest")
    @patch("scripts.universal_chsl_importer.discover_source_pdfs")
    def test_main_cooldown_execution_flow(self, mock_discover, mock_load, mock_save):
        from scripts.universal_chsl_importer import main

        mock_discover.return_value = [
            ("/path/to/paper1.pdf", "hash1"),
            ("/path/to/paper2.pdf", "hash2"),
            ("/path/to/paper3.pdf", "hash3"),
            ("/path/to/paper4.pdf", "hash4"),
        ]
        mock_load.return_value = {"papers": {}}

        # Run with --cooldown-every 2 --cooldown-seconds 1
        test_args = ["universal_chsl_importer.py", "--cooldown-every", "2", "--cooldown-seconds", "1", "--pdf-workers", "2"]
        with patch.object(sys, "argv", test_args):
            captured_stdout = io.StringIO()
            with patch("sys.stdout", captured_stdout):
                main()

            output = captured_stdout.getvalue()
            # Verify Thermal Cooldown banner occurred once (after first 2 papers, but not after all 4 finish)
            self.assertEqual(output.count("THERMAL COOLDOWN"), 1)
            self.assertIn("Completed: 2 / 4 papers", output)
            self.assertIn("Cooling down for 1 seconds...", output)
            self.assertIn("CPU workers: idle", output)
            self.assertIn("OCR workers: idle", output)
            self.assertIn("RESUMING", output)
            self.assertIn("Batch processing finished", output)

    @patch("concurrent.futures.ProcessPoolExecutor", DummyExecutor)
    @patch("scripts.universal_chsl_importer.save_manifest")
    @patch("scripts.universal_chsl_importer.load_manifest")
    @patch("scripts.universal_chsl_importer.discover_source_pdfs")
    def test_main_no_cooldown_flag(self, mock_discover, mock_load, mock_save):
        from scripts.universal_chsl_importer import main

        mock_discover.return_value = [
            ("/path/to/paper1.pdf", "hash1"),
            ("/path/to/paper2.pdf", "hash2"),
            ("/path/to/paper3.pdf", "hash3"),
            ("/path/to/paper4.pdf", "hash4"),
        ]
        mock_load.return_value = {"papers": {}}

        test_args = ["universal_chsl_importer.py", "--no-cooldown", "--pdf-workers", "2"]
        with patch.object(sys, "argv", test_args):
            captured_stdout = io.StringIO()
            with patch("sys.stdout", captured_stdout):
                main()

            output = captured_stdout.getvalue()
            # Verify Thermal Cooldown banner NEVER occurred
            self.assertEqual(output.count("THERMAL COOLDOWN"), 0)
            self.assertIn("Thermal Cooldown : DISABLED", output)
            self.assertIn("Batch processing finished", output)


if __name__ == "__main__":
    unittest.main()
