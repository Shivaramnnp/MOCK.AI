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
 * Falls back to plain SharedPreferences if encryption is unavailable
 * (e.g., hardware-backed keystore not present on very old devices).
 */
object SecureStorage {

    private const val TAG = "SecureStorage"
    private const val PREFS_FILE = "mock_ai_secure_prefs"

    // Keys we store securely
    const val KEY_JWT_TOKEN = "jwt_token"
    const val KEY_USER_ROLE = "user_role_cached"
    const val KEY_GEMINI_API_KEY = "gemini_api_key"
    const val KEY_GROQ_API_KEY = "groq_api_key"
    const val KEY_SESSION_ID = "session_id"

    private var encryptedPrefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        encryptedPrefs = try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            ).also {
                Log.d(TAG, "✅ EncryptedSharedPreferences initialized")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ EncryptedSharedPreferences failed — falling back to plain prefs", e)
            // Fallback — still works but not encrypted. Log a warning for production.
            context.getSharedPreferences(PREFS_FILE + "_fallback", Context.MODE_PRIVATE)
        }
    }

    fun put(key: String, value: String) {
        encryptedPrefs?.edit()?.putString(key, value)?.apply()
            ?: Log.e(TAG, "SecureStorage not initialized — call init(context) first")
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
}
