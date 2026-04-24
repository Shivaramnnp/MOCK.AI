package com.shiva.magics.util

import android.util.Log

/**
 * Gap #15: No error recovery system
 *
 * Centralised ErrorRecoveryManager that:
 *  1. Classifies every error into actionable categories
 *  2. Emits structured recovery actions the UI can act on
 *  3. Remembers error history to detect recurring failures
 *  4. Provides user-facing messages that guide next steps (not raw stack traces)
 */
object ErrorRecoveryManager {

    private const val TAG = "ErrorRecovery"
    private const val MAX_ERROR_HISTORY = 50

    enum class ErrorCategory {
        NETWORK_TIMEOUT,
        NETWORK_UNREACHABLE,
        AI_RATE_LIMITED,
        AI_CONTENT_POLICY,
        FILE_TOO_LARGE,
        FILE_CORRUPTED,
        FILE_UNSUPPORTED,
        PARSE_FAILURE,
        AUTH_EXPIRED,
        UNKNOWN
    }

    enum class RecoveryAction {
        RETRY_IMMEDIATELY,
        RETRY_AFTER_DELAY,
        SWITCH_AI_PROVIDER,
        COMPRESS_AND_RETRY,
        SHOW_MANUAL_INPUT,
        SIGN_IN_AGAIN,
        CONTACT_SUPPORT,
        NOTHING
    }

    data class RecoveryPlan(
        val category: ErrorCategory,
        val userMessage: String,
        val technicalDetail: String,
        val action: RecoveryAction,
        val actionLabel: String,          // Button label to show in UI
        val retryDelayMs: Long = 0L
    )

    data class ErrorRecord(
        val category: ErrorCategory,
        val message: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    private val errorHistory = ArrayDeque<ErrorRecord>(MAX_ERROR_HISTORY)

    /** Classify and recover from any throwable or error string */
    fun handle(error: Throwable? = null, errorMessage: String = ""): RecoveryPlan {
        val msg = (error?.message ?: errorMessage).lowercase()
        Log.e(TAG, "🔴 Error received: $msg", error)

        val category = classify(msg)
        val plan = buildPlan(category, error?.message ?: errorMessage)

        // Track for recurrence analysis
        errorHistory.addLast(ErrorRecord(category, msg))
        if (errorHistory.size > MAX_ERROR_HISTORY) errorHistory.removeFirst()

        Log.d(TAG, "🛠 Recovery plan: category=${plan.category}, action=${plan.action}, message=${plan.userMessage}")
        return plan
    }

    private fun classify(msg: String): ErrorCategory = when {
        msg.contains("429") || msg.contains("rate limit") || msg.contains("quota") ->
            ErrorCategory.AI_RATE_LIMITED
        msg.contains("timeout") || msg.contains("timed out") || msg.contains("socket timeout") ->
            ErrorCategory.NETWORK_TIMEOUT
        msg.contains("unable to resolve") || msg.contains("no address") ||
                msg.contains("network") || msg.contains("unreachable") ->
            ErrorCategory.NETWORK_UNREACHABLE
        msg.contains("policy") || msg.contains("safety") || msg.contains("blocked") ||
                msg.contains("harm") ->
            ErrorCategory.AI_CONTENT_POLICY
        msg.contains("too large") || msg.contains("max size") || msg.contains("413") ->
            ErrorCategory.FILE_TOO_LARGE
        msg.contains("corrupt") || msg.contains("invalid pdf") || msg.contains("cannot open") ->
            ErrorCategory.FILE_CORRUPTED
        msg.contains("unsupported") || msg.contains("format") || msg.contains("mime") ->
            ErrorCategory.FILE_UNSUPPORTED
        msg.contains("json") || msg.contains("parse") || msg.contains("decode") ||
                msg.contains("unexpected") ->
            ErrorCategory.PARSE_FAILURE
        msg.contains("auth") || msg.contains("401") || msg.contains("403") ||
                msg.contains("token") || msg.contains("unauthenticated") ->
            ErrorCategory.AUTH_EXPIRED
        else -> ErrorCategory.UNKNOWN
    }

    private fun buildPlan(category: ErrorCategory, technical: String): RecoveryPlan = when (category) {
        ErrorCategory.AI_RATE_LIMITED -> RecoveryPlan(
            category = category,
            userMessage = "AI is busy right now. We'll retry automatically in 30 seconds.",
            technicalDetail = technical,
            action = RecoveryAction.RETRY_AFTER_DELAY,
            actionLabel = "Wait & Retry",
            retryDelayMs = 30_000L
        )
        ErrorCategory.NETWORK_TIMEOUT -> RecoveryPlan(
            category = category,
            userMessage = "Request timed out. Check your connection and try again.",
            technicalDetail = technical,
            action = RecoveryAction.RETRY_IMMEDIATELY,
            actionLabel = "Retry"
        )
        ErrorCategory.NETWORK_UNREACHABLE -> RecoveryPlan(
            category = category,
            userMessage = "No internet connection. Reconnect and try again.",
            technicalDetail = technical,
            action = RecoveryAction.RETRY_IMMEDIATELY,
            actionLabel = "Retry"
        )
        ErrorCategory.AI_CONTENT_POLICY -> RecoveryPlan(
            category = category,
            userMessage = "This content was flagged by our AI. Try a different source or rephrase your topic.",
            technicalDetail = technical,
            action = RecoveryAction.SHOW_MANUAL_INPUT,
            actionLabel = "Enter Topic Manually"
        )
        ErrorCategory.FILE_TOO_LARGE -> RecoveryPlan(
            category = category,
            userMessage = "File is too large. We'll automatically split it into smaller chunks and retry.",
            technicalDetail = technical,
            action = RecoveryAction.COMPRESS_AND_RETRY,
            actionLabel = "Process in Chunks"
        )
        ErrorCategory.FILE_CORRUPTED -> RecoveryPlan(
            category = category,
            userMessage = "This file appears to be corrupted or password-protected. Try exporting it again.",
            technicalDetail = technical,
            action = RecoveryAction.SHOW_MANUAL_INPUT,
            actionLabel = "Type Content Manually"
        )
        ErrorCategory.FILE_UNSUPPORTED -> RecoveryPlan(
            category = category,
            userMessage = "This file type isn't supported yet. Try PDF, DOCX, or an image instead.",
            technicalDetail = technical,
            action = RecoveryAction.NOTHING,
            actionLabel = "OK"
        )
        ErrorCategory.PARSE_FAILURE -> RecoveryPlan(
            category = category,
            userMessage = "AI response was malformed. Switching provider and retrying…",
            technicalDetail = technical,
            action = RecoveryAction.SWITCH_AI_PROVIDER,
            actionLabel = "Try Different AI"
        )
        ErrorCategory.AUTH_EXPIRED -> RecoveryPlan(
            category = category,
            userMessage = "Your session has expired. Please sign in again.",
            technicalDetail = technical,
            action = RecoveryAction.SIGN_IN_AGAIN,
            actionLabel = "Sign In"
        )
        ErrorCategory.UNKNOWN -> RecoveryPlan(
            category = category,
            userMessage = "Something went wrong. Please try again or contact support if the issue persists.",
            technicalDetail = technical,
            action = RecoveryAction.RETRY_IMMEDIATELY,
            actionLabel = "Retry"
        )
    }

    /** Returns true if a specific error category has occurred frequently (≥ 3 times in last 10) */
    fun isRecurring(category: ErrorCategory): Boolean {
        val recent = errorHistory.takeLast(10)
        val count = recent.count { it.category == category }
        return count >= 3
    }

    fun clearHistory() {
        errorHistory.clear()
    }
}
