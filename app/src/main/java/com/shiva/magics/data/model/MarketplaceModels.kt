package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

/**
 * Phase 5 — Week 1: Marketplace & Creator Models
 */

@Serializable
data class PublishedExam(
    val id: String,
    val templateId: String,
    val title: String,
    val subject: String,
    val description: String,
    val creatorId: String,
    val creatorName: String,
    val price: Float = 0f,
    val rating: Float = 5.0f,
    val totalSales: Int = 0,
    val visibility: Visibility = Visibility.PUBLIC,
    val publishedAt: Long = System.currentTimeMillis()
)

@Serializable
enum class Visibility {
    PUBLIC,
    PRIVATE,
    DRAFT,
    UNLISTED
}

@Serializable
data class CreatorProfile(
    val id: String,
    val name: String,
    val bio: String,
    val totalExamsPublished: Int = 0,
    val totalRevenue: Float = 0f,
    val avgRating: Float = 0f
)
