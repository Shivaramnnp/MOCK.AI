package com.shiva.magics.util

import com.shiva.magics.data.local.MarketplaceExamEntity

/**
 * Phase 5 — Week 2: Marketplace Ranking Engine
 * Calculates a popularity score for sorting the discover feed.
 */
object MarketplaceRankingEngine {

    /**
     * Formula:
     * score = (downloads * 0.4) + (rating * 0.3) + (recency * 0.2) + (completionRate * 0.1)
     */
    fun calculateScore(exam: MarketplaceExamEntity): Float {
        val downloadScore = exam.downloads.toFloat() * 0.4f
        val ratingScore = exam.rating * 0.3f
        
        // Recency score (Higher for newer exams)
        // Normalize: 1.0 for newly published, decays over 30 days
        val daysSincePublished = (System.currentTimeMillis() - exam.publishedAt) / (1000 * 60 * 60 * 24)
        val recencyFactor = (1.0f - (daysSincePublished.toFloat() / 30f)).coerceIn(0f, 1f)
        val recencyScore = recencyFactor * 0.2f
        
        val completionScore = exam.completionRate * 0.1f
        
        return downloadScore + ratingScore + recencyScore + completionScore
    }

    /**
     * Ranks a list of exams based on their calculated popularity score.
     */
    fun rank(exams: List<MarketplaceExamEntity>): List<MarketplaceExamEntity> {
        return exams.sortedByDescending { calculateScore(it) }
    }
}
