package com.shiva.magics.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.shiva.magics.data.model.UserProfile
import com.shiva.magics.data.model.UserRole
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── SharedPrefs key constants ─────────────────────────────────────────────────
private const val PREFS_NAME    = "mock_ai_user_prefs"
private const val KEY_ROLE      = "user_role"
private const val KEY_FULL_NAME = "user_full_name"
private const val KEY_EMAIL     = "user_email"
private const val KEY_PHONE     = "user_phone"
private const val KEY_UID       = "user_uid"

sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Success(val profile: UserProfile) : ProfileUiState
    data class Error(val message: String) : ProfileUiState
    data object Idle : ProfileUiState
}

class ProfileViewModel(private val context: Context) : ViewModel() {

    private val auth = FirebaseAuth.getInstance()
    private val db   = FirebaseFirestore.getInstance()
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Idle)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    private val _profile = MutableStateFlow(UserProfile())
    val profile: StateFlow<UserProfile> = _profile.asStateFlow()

    // Whether role selection has been completed (for post-registration routing)
    private val _roleSelected = MutableStateFlow(hasStoredRole())
    val roleSelected: StateFlow<Boolean> = _roleSelected.asStateFlow()

    init {
        // Immediately serve cached data, then refresh from Firestore in background
        loadCachedProfile()
        refreshFromFirestore()
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────

    private fun hasStoredRole(): Boolean = prefs.contains(KEY_ROLE)

    private fun loadCachedProfile() {
        val uid  = auth.currentUser?.uid ?: return
        val role = UserRole.fromString(prefs.getString(KEY_ROLE, null))
        val profile = UserProfile(
            uid         = uid,
            fullName    = prefs.getString(KEY_FULL_NAME, "") ?: "",
            email       = prefs.getString(KEY_EMAIL, auth.currentUser?.email ?: "") ?: "",
            phoneNumber = prefs.getString(KEY_PHONE, "") ?: "",
            role        = role
        )
        _profile.value = profile
        if (hasStoredRole()) _uiState.value = ProfileUiState.Success(profile)
    }

    private fun cacheProfile(profile: UserProfile) {
        prefs.edit()
            .putString(KEY_ROLE, profile.role.name)
            .putString(KEY_FULL_NAME, profile.fullName)
            .putString(KEY_EMAIL, profile.email)
            .putString(KEY_PHONE, profile.phoneNumber)
            .putString(KEY_UID, profile.uid)
            .apply()
    }

    // ── Firestore refresh ──────────────────────────────────────────────────────

    private fun refreshFromFirestore() {
        val uid = auth.currentUser?.uid ?: return
        db.collection("users").document(uid).get()
            .addOnSuccessListener { doc ->
                if (doc.exists()) {
                    val roleName = doc.getString("role") ?: doc.getString("userRole")
                    val profile = UserProfile(
                        uid         = uid,
                        fullName    = doc.getString("fullName") ?: "",
                        email       = doc.getString("email") ?: auth.currentUser?.email ?: "",
                        phoneNumber = doc.getString("phoneNumber") ?: "",
                        role        = UserRole.fromString(roleName),
                        createdAt   = doc.getLong("createdAt") ?: 0L
                    )
                    cacheProfile(profile)
                    _profile.value = profile
                    _roleSelected.value = roleName != null
                    _uiState.value = ProfileUiState.Success(profile)
                }
            }
            .addOnFailureListener { e ->
                if (_uiState.value !is ProfileUiState.Success) {
                    _uiState.value = ProfileUiState.Error(e.localizedMessage ?: "Unknown error")
                }
            }
    }

    // ── Public actions ─────────────────────────────────────────────────────────

    /** Called once after OTP verification to save the chosen role. */
    fun saveRole(role: UserRole) {
        val uid = auth.currentUser?.uid ?: run {
            // Not logged in yet — just cache locally
            prefs.edit().putString(KEY_ROLE, role.name).apply()
            _profile.value = _profile.value.copy(role = role)
            _roleSelected.value = true
            return
        }
        _uiState.value = ProfileUiState.Loading
        db.collection("users").document(uid)
            .update("role", role.name)
            .addOnSuccessListener {
                val updated = _profile.value.copy(role = role)
                cacheProfile(updated)
                _profile.value = updated
                _roleSelected.value = true
                _uiState.value = ProfileUiState.Success(updated)
            }
            .addOnFailureListener {
                // Even if Firestore fails, persist locally
                prefs.edit().putString(KEY_ROLE, role.name).apply()
                val updated = _profile.value.copy(role = role)
                _profile.value = updated
                _roleSelected.value = true
                _uiState.value = ProfileUiState.Success(updated)
            }
    }

    /** Update display name + phone in Firestore and cache. */
    fun updateProfile(fullName: String, phone: String) {
        val uid = auth.currentUser?.uid ?: return
        _uiState.value = ProfileUiState.Loading
        db.collection("users").document(uid)
            .update(mapOf("fullName" to fullName, "phoneNumber" to phone))
            .addOnSuccessListener {
                val updated = _profile.value.copy(fullName = fullName, phoneNumber = phone)
                cacheProfile(updated)
                _profile.value = updated
                _uiState.value = ProfileUiState.Success(updated)
            }
            .addOnFailureListener { e ->
                _uiState.value = ProfileUiState.Error(e.localizedMessage ?: "Update failed")
            }
    }

    /** Sign out — clears all local cache. */
    fun signOut() {
        auth.signOut()
        prefs.edit().clear().apply()
        _profile.value = UserProfile()
        _roleSelected.value = false
        _uiState.value = ProfileUiState.Idle
    }

    /** Whether a user is currently logged in. */
    fun isLoggedIn(): Boolean = auth.currentUser != null

    /** Cached role — read without suspend. */
    fun getCachedRole(): UserRole = _profile.value.role

    // ── Factory ───────────────────────────────────────────────────────────────

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ProfileViewModel(context.applicationContext) as T
    }
}
