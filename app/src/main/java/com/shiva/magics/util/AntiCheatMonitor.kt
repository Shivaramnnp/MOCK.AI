package com.shiva.magics.util

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Gap #7: No anti-cheat detection
 *
 * Detects and records suspicious behavior during a test session:
 *  - App switching / leaving the test screen (onPause events)
 *  - Clipboard access (copy/paste answers)
 *  - Abnormally fast answers (< threshold ms — suggests lookup)
 *  - Abnormally slow answers (suggests external research)
 *  - Screen rotation (possible device hand-off)
 *  - Multiple background switches
 *
 * All flags are stored on the result and surfaced to the teacher dashboard.
 * This is NOT blocking — students can still submit; flags are advisory.
 */
object AntiCheatMonitor {

    private const val TAG = "AntiCheat"

    // Thresholds
    private const val MIN_ANSWER_TIME_MS = 1_500L     // < 1.5 s = suspiciously fast
    private const val MAX_ANSWER_TIME_MS = 300_000L   // > 5 min = likely looked it up
    private const val MAX_ALLOWED_SWITCHES = 3        // app switches before flagging

    data class CheatFlag(
        val type: FlagType,
        val questionIndex: Int = -1,
        val detail: String = "",
        val timestamp: Long = System.currentTimeMillis()
    )

    enum class FlagType {
        APP_SWITCH,
        CLIPBOARD_ACCESS,
        TOO_FAST_ANSWER,
        TOO_SLOW_ANSWER,
        EXCESSIVE_SWITCHING,
        SCREEN_ROTATION_DURING_TEST
    }

    data class SessionReport(
        val sessionId: String,
        val flags: List<CheatFlag>,
        val isSuspicious: Boolean,
        val suspicionReason: String
    )

    private val sessionFlags = mutableListOf<CheatFlag>()
    private var appSwitchCount = 0
    private var questionStartTime = System.currentTimeMillis()
    private var sessionId = ""

    /** Call when a new test session begins */
    fun startSession(id: String) {
        sessionFlags.clear()
        appSwitchCount = 0
        sessionId = id
        questionStartTime = System.currentTimeMillis()
        Log.d(TAG, "🛡 AntiCheat session started: $id")
    }

    /** Call from onPause of TestPlayerScreen */
    fun onAppBackground(currentQuestionIndex: Int) {
        appSwitchCount++
        val flag = CheatFlag(
            type = FlagType.APP_SWITCH,
            questionIndex = currentQuestionIndex,
            detail = "Switch #$appSwitchCount"
        )
        sessionFlags.add(flag)

        if (appSwitchCount > MAX_ALLOWED_SWITCHES) {
            sessionFlags.add(
                CheatFlag(
                    type = FlagType.EXCESSIVE_SWITCHING,
                    questionIndex = currentQuestionIndex,
                    detail = "App switched $appSwitchCount times"
                )
            )
        }
        Log.w(TAG, "⚠️ App backgrounded during Q${currentQuestionIndex + 1}. Total switches: $appSwitchCount")
    }

    /** Call when the user selects an answer */
    fun onAnswerSelected(questionIndex: Int) {
        val elapsed = System.currentTimeMillis() - questionStartTime

        if (elapsed < MIN_ANSWER_TIME_MS) {
            sessionFlags.add(
                CheatFlag(
                    type = FlagType.TOO_FAST_ANSWER,
                    questionIndex = questionIndex,
                    detail = "Answered in ${elapsed}ms (<${MIN_ANSWER_TIME_MS}ms)"
                )
            )
            Log.w(TAG, "⚡ Q${questionIndex + 1} answered too fast: ${elapsed}ms")
        } else if (elapsed > MAX_ANSWER_TIME_MS) {
            sessionFlags.add(
                CheatFlag(
                    type = FlagType.TOO_SLOW_ANSWER,
                    questionIndex = questionIndex,
                    detail = "Answered in ${elapsed / 1000}s (>${MAX_ANSWER_TIME_MS / 1000}s)"
                )
            )
            Log.w(TAG, "🐢 Q${questionIndex + 1} took too long: ${elapsed / 1000}s")
        }

        // Reset timer for next question
        questionStartTime = System.currentTimeMillis()
    }

    /** Call when onConfigurationChanged fires (detect screen rotation) */
    fun onScreenRotation(questionIndex: Int) {
        sessionFlags.add(
            CheatFlag(
                type = FlagType.SCREEN_ROTATION_DURING_TEST,
                questionIndex = questionIndex,
                detail = "Screen rotated during test"
            )
        )
        Log.w(TAG, "🔄 Screen rotated during Q${questionIndex + 1}")
    }

    /** Check clipboard on resume for recent copy events */
    fun checkClipboard(context: Context, questionIndex: Int) {
        try {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            if (clipboard.hasPrimaryClip()) {
                val clip = clipboard.primaryClip
                val recentText = clip?.getItemAt(0)?.text?.toString() ?: return
                if (recentText.length > 10) {
                    sessionFlags.add(
                        CheatFlag(
                            type = FlagType.CLIPBOARD_ACCESS,
                            questionIndex = questionIndex,
                            detail = "Clipboard had content: '${recentText.take(30)}…'"
                        )
                    )
                    Log.w(TAG, "📋 Clipboard content detected during Q${questionIndex + 1}")
                }
            }
        } catch (e: Exception) {
            // Clipboard access is best-effort
        }
    }

    /** Generate a final session report — call before saving results */
    fun generateReport(): SessionReport {
        val isSuspicious = sessionFlags.size >= 3 ||
                sessionFlags.any { it.type == FlagType.EXCESSIVE_SWITCHING } ||
                sessionFlags.count { it.type == FlagType.TOO_FAST_ANSWER } >= 5

        val reason = when {
            sessionFlags.any { it.type == FlagType.EXCESSIVE_SWITCHING } ->
                "Switched apps ${appSwitchCount} times during test"
            sessionFlags.count { it.type == FlagType.TOO_FAST_ANSWER } >= 5 ->
                "${sessionFlags.count { it.type == FlagType.TOO_FAST_ANSWER }} questions answered suspiciously fast"
            sessionFlags.size >= 3 -> "Multiple suspicious events detected"
            else -> "No suspicious activity"
        }

        Log.d(TAG, "📊 Session $sessionId report: suspicious=$isSuspicious, flags=${sessionFlags.size}, reason=$reason")
        return SessionReport(sessionId, sessionFlags.toList(), isSuspicious, reason)
    }

    /** Persist report to Firestore async (best-effort) */
    suspend fun persistReport(report: SessionReport, assignmentId: String? = null) {
        if (report.flags.isEmpty()) return
        withContext(Dispatchers.IO) {
            try {
                val data = mapOf(
                    "sessionId" to report.sessionId,
                    "isSuspicious" to report.isSuspicious,
                    "suspicionReason" to report.suspicionReason,
                    "flagCount" to report.flags.size,
                    "flags" to report.flags.map {
                        mapOf("type" to it.type.name, "q" to it.questionIndex, "detail" to it.detail)
                    },
                    "assignmentId" to (assignmentId ?: ""),
                    "recordedAt" to System.currentTimeMillis()
                )
                com.google.firebase.firestore.FirebaseFirestore.getInstance()
                    .collection("cheatReports")
                    .document(report.sessionId)
                    .set(data)
                Log.d(TAG, "✅ Cheat report persisted for session ${report.sessionId}")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to persist cheat report: ${e.message}")
            }
        }
    }
}
