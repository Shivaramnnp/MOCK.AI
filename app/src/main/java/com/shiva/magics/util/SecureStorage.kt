package com.shiva.magics.util

import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import android.content.Context

/**
 * Gap #8: No data encryption
 *
 * Wraps EncryptedSharedPreferences (AES-256/GCM) from Jetpack Security.
 * Use this for storing:
 *  - API keys
 *  - User tokens
 *  - Sensitive test results
 *
 * SECURITY POLICY: No plaintext fallback.
 * If encryption cannot be initialized, init() throws SecurityException.
 * Callers must handle initialization failure explicitly — never store
 * sensitive data unencrypted as a silent fallback.
 */
object SecureStorage {

    private const val TAG = "SecureStorage"
    private const val PREFS_FILE = "mock_ai_secure_prefs"

    // Keys we store securely
    const val KEY_JWT_TOKEN    = "jwt_token"
    const val KEY_USER_ROLE    = "user_role_cached"
    const val KEY_GEMINI_API_KEY = "gemini_api_key"
    const val KEY_GROQ_API_KEY = "groq_api_key"
    const val KEY_SESSION_ID   = "session_id"

    private var encryptedPrefs: android.content.SharedPreferences? = null

    /**
     * Must be called before any put/get. Throws SecurityException on failure —
     * callers must catch and surface to the user rather than silently degrading.
     */
    @Throws(SecurityException::class)
    fun init(context: Context) {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            encryptedPrefs = EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            Log.d(TAG, "✅ EncryptedSharedPreferences initialized")
        } catch (e: Exception) {
            // Do NOT fall back to plaintext. Fail loudly so the caller
            // knows encryption is unavailable and can decide the policy.
            Log.e(TAG, "❌ EncryptedSharedPreferences failed — no plaintext fallback", e)
            throw SecurityException(
                "SecureStorage: encryption unavailable on this device. " +
                "Cannot store sensitive data safely. Cause: ${e.message}", e
            )
        }
    }

    fun put(key: String, value: String) {
        val prefs = encryptedPrefs
            ?: throw IllegalStateException("SecureStorage not initialized — call init(context) first")
        prefs.edit().putString(key, value).apply()
    }

    fun get(key: String, default: String = ""): String {
        return encryptedPrefs?.getString(key, default) ?: default
    }

    fun remove(key: String) {
        encryptedPrefs?.edit()?.remove(key)?.apply()
    }

    fun clearAll() {
        encryptedPrefs?.edit()?.clear()?.apply()
        Log.d(TAG, "🗑 SecureStorage cleared")
    }

    fun contains(key: String): Boolean = encryptedPrefs?.contains(key) == true

    /** True only if init() completed successfully */
    val isInitialized: Boolean get() = encryptedPrefs != null
}
