package com.shiva.magics.util

import com.shiva.magics.data.local.MarketplaceDao
import com.shiva.magics.data.local.MarketplaceExamEntity
import com.shiva.magics.data.model.ExamTemplate
import com.shiva.magics.data.model.Visibility
import java.util.UUID

/**
 * Phase 5 — Week 1: Creator Publishing Engine
 * Handles the workflow for taking a private exam template and making it public in the marketplace.
 */
object PublishingEngine {

    /**
     * Publishes an exam template to the marketplace.
     */
    suspend fun publish(
        template: ExamTemplate,
        subject: String,
        price: Float,
        visibility: Visibility,
        marketplaceDao: MarketplaceDao
    ): String {
        val publishedId = UUID.randomUUID().toString()
        val entity = MarketplaceExamEntity(
            id = publishedId,
            templateId = template.id,
            title = template.title,
            subject = subject,
            description = template.description,
            creatorId = "CURRENT_USER_ID", // Placeholder for actual Auth
            price = price,
            visibility = visibility.name
        )
        
        marketplaceDao.publishExam(entity)
        return publishedId
    }

    /**
     * Logic to determine if an exam is eligible for publishing.
     * Checks for minimum question counts and instructions.
     */
    fun validateEligibility(template: ExamTemplate): Boolean {
        if (template.sections.isEmpty()) return false
        val totalQuestions = template.sections.sumOf { it.questionCount }
        return totalQuestions >= 5 && template.title.length >= 3
    }
}
