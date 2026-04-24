package com.shiva.magics.util

import android.app.Activity
import android.content.Context
import android.os.Build
import android.util.Log
import android.view.WindowManager

/**
 * Mentor Feature #9: Exam Lockdown Mode
 *
 * Implements a secure exam environment by:
 *  1. Blocking screenshots and screen recording (FLAG_SECURE)
 *  2. Keeping the screen on for the duration of the exam
 *  3. Preventing screen dimming during active test
 *  4. Logging lockdown events for audit
 *
 * NOTE: Full kiosk mode (disabling navigation bar) requires device owner
 * permissions (MDM) not available to Play Store apps. This implements
 * the maximum restriction achievable by a standard app.
 *
 * The AntiCheatMonitor handles behavioral detection (app switching, etc.)
 * and works alongside this lockdown for a complete exam integrity layer.
 */
object ExamLockdownManager {

    private const val TAG = "ExamLockdown"

    data class LockdownConfig(
        val blockScreenshots: Boolean = true,
        val keepScreenOn: Boolean = true,
        val logViolations: Boolean = true
    )

    private var isLocked = false
    private var lockStartTime = 0L
    private val violationLog = mutableListOf<String>()

    /**
     * Enable lockdown — call from TestPlayerScreen's onStart/onResume.
     * Must be called on the main thread (Activity context required).
     */
    fun enable(activity: Activity, config: LockdownConfig = LockdownConfig()) {
        if (isLocked) return

        val flags = mutableListOf<Int>()

        // 1. Block screenshots and screen recording
        if (config.blockScreenshots) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            flags.add(WindowManager.LayoutParams.FLAG_SECURE)
            Log.d(TAG, "🔒 FLAG_SECURE enabled — screenshots/recording blocked")
        }

        // 2. Keep screen on (prevent auto-lock mid-exam)
        if (config.keepScreenOn) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            flags.add(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            Log.d(TAG, "💡 FLAG_KEEP_SCREEN_ON enabled — screen stays on")
        }

        // 3. On Android P+: prevent display cutout dimming
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = activity.window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            activity.window.attributes = lp
        }

        isLocked = true
        lockStartTime = System.currentTimeMillis()
        Log.d(TAG, "🛡 Exam lockdown ENABLED (flags: ${flags.size})")
    }

    /**
     * Disable lockdown — call from TestPlayerScreen's onStop/onDestroy.
     * MUST always be called to release window flags (prevents memory leaks).
     */
    fun disable(activity: Activity) {
        if (!isLocked) return

        activity.window.clearFlags(
            WindowManager.LayoutParams.FLAG_SECURE or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        val durationMin = (System.currentTimeMillis() - lockStartTime) / 60_000
        Log.d(TAG, "🔓 Exam lockdown DISABLED after ${durationMin}min. Violations: ${violationLog.size}")
        isLocked = false
        violationLog.clear()
    }

    /** Log a violation event (called by AntiCheatMonitor for unified audit trail) */
    fun logViolation(description: String) {
        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
            .format(java.util.Date())
        val entry = "[$timestamp] $description"
        violationLog.add(entry)
        Log.w(TAG, "⚠️ VIOLATION: $entry")
    }

    fun getViolationLog(): List<String> = violationLog.toList()
    fun isActive(): Boolean = isLocked
    fun violationCount(): Int = violationLog.size
}
