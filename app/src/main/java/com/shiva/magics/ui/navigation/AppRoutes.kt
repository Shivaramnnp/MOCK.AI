package com.shiva.magics.ui.navigation

import kotlinx.serialization.Serializable

sealed class AppRoutes {
    @Serializable data object Onboarding : AppRoutes()
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
    // Phase 1
    @Serializable data object RoleSelection : AppRoutes()
    @Serializable data object Profile : AppRoutes()
    // Phase 2
    @Serializable data object Classroom : AppRoutes()
    @Serializable data class ClassDetail(val classId: String) : AppRoutes()
    @Serializable data object TeacherDashboard : AppRoutes()
    @Serializable data object StudentAssignments : AppRoutes()
    // Phase 3
    @Serializable data object Analytics : AppRoutes()
    // Phase 4
    @Serializable data object Marketplace : AppRoutes()
    @Serializable data object CreatorDashboard : AppRoutes()
    @Serializable data class ExamSimulation(val templateId: String) : AppRoutes()
    @Serializable data class ExamResults(val examId: String) : AppRoutes()
}
