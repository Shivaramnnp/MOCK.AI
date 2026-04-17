package com.shiva.magics.ui.navigation

import kotlinx.serialization.Serializable

sealed class AppRoutes {
    @Serializable data object Home : AppRoutes()
    @Serializable data object Processing : AppRoutes()
    @Serializable data object Editor : AppRoutes()
    @Serializable data object TestPlayer : AppRoutes()
    @Serializable data class TestPlayerWithId(val id: Long) : AppRoutes()
    @Serializable data object Results : AppRoutes()
    @Serializable data object Review : AppRoutes()
    @Serializable data object Camera : AppRoutes()
    @Serializable data object VoiceRecorder : AppRoutes()
    @Serializable data object Settings : AppRoutes()
    @Serializable data object Login : AppRoutes()
    @Serializable data object ForgotPassword : AppRoutes()
    @Serializable data class OtpVerification(val email: String) : AppRoutes()
}
