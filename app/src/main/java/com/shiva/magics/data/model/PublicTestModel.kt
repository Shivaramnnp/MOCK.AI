package com.shiva.magics.data.model

import com.shiva.magics.data.local.QuestionEntity

data class PublicTestModel(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val category: String = "",
    val difficulty: String = "Medium",
    val creatorId: String = "",
    val creatorName: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val questionCount: Int = 0,
    val questionsJson: String = "[]",
    val testPrice: Int? = null, // null means free. Int is price in cents or smallest currency unit.
    val attemptCount: Int = 0,
    val rating: Float = 0f,
    val reviewCount: Int = 0
) {
    fun toFirestoreMap(): Map<String, Any?> = mapOf(
        "title" to title,
        "description" to description,
        "category" to category,
        "difficulty" to difficulty,
        "creatorId" to creatorId,
        "creatorName" to creatorName,
        "createdAt" to createdAt,
        "questionCount" to questionCount,
        "questionsJson" to questionsJson,
        "testPrice" to testPrice,
        "attemptCount" to attemptCount,
        "rating" to rating,
        "reviewCount" to reviewCount
    )

    companion object {
        fun fromFirestore(id: String, map: Map<String, Any>): PublicTestModel {
            return PublicTestModel(
                id = id,
                title = map["title"] as? String ?: "",
                description = map["description"] as? String ?: "",
                category = map["category"] as? String ?: "",
                difficulty = map["difficulty"] as? String ?: "Medium",
                creatorId = map["creatorId"] as? String ?: "",
                creatorName = map["creatorName"] as? String ?: "",
                createdAt = (map["createdAt"] as? Number)?.toLong() ?: 0L,
                questionCount = (map["questionCount"] as? Number)?.toInt() ?: 0,
                questionsJson = map["questionsJson"] as? String ?: "[]",
                testPrice = (map["testPrice"] as? Number)?.toInt(),
                attemptCount = (map["attemptCount"] as? Number)?.toInt() ?: 0,
                rating = (map["rating"] as? Number)?.toFloat() ?: 0f,
                reviewCount = (map["reviewCount"] as? Number)?.toInt() ?: 0
            )
        }
    }
}
