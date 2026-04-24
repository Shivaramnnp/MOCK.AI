package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class UserRole(val displayName: String, val emoji: String, val description: String) {
    TEACHER(
        displayName = "Teacher",
        emoji = "👨‍🏫",
        description = "Create, assign & track student tests"
    ),
    STUDENT(
        displayName = "Student",
        emoji = "🎓",
        description = "Take tests & view your progress"
    ),
    LEARNER(
        displayName = "Learner",
        emoji = "📖",
        description = "Learn at your own pace independently"
    );

    companion object {
        fun fromString(value: String?): UserRole = when (value?.uppercase()) {
            "TEACHER" -> TEACHER
            "STUDENT" -> STUDENT
            else      -> LEARNER
        }
    }
}
