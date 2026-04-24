package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

@Serializable
data class UserProfile(
    val uid: String = "",
    val fullName: String = "",
    val email: String = "",
    val phoneNumber: String = "",
    val role: UserRole = UserRole.LEARNER,
    val createdAt: Long = 0L
)
