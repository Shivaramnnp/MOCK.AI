package com.shiva.magics.util

import com.shiva.magics.data.local.MarketplaceExamEntity
import org.junit.Assert.*
import org.junit.Test

class MarketplaceRankingEngineTest {

    @Test
    fun testRanking_PopularityOrder() {
        val examA = MarketplaceExamEntity(
            id = "A", templateId = "T1", title = "A", subject = "S", description = "D", creatorId = "C", price = 0f, visibility = "PUBLIC", 
            downloads = 100, rating = 4.5f
        )
        val examB = MarketplaceExamEntity(
            id = "B", templateId = "T2", title = "B", subject = "S", description = "D", creatorId = "C", price = 0f, visibility = "PUBLIC", 
            downloads = 10, rating = 4.8f
        )

        val ranked = MarketplaceRankingEngine.rank(listOf(examB, examA))
        
        assertEquals("Exam A (100 downloads) should rank higher than Exam B (10 downloads)", "A", ranked[0].id)
    }

    @Test
    fun testRanking_RecencyBoost() {
        val oldExam = MarketplaceExamEntity(
            id = "Old", templateId = "T1", title = "Old", subject = "S", description = "D", creatorId = "C", price = 0f, visibility = "PUBLIC", 
            downloads = 10, rating = 4.0f, publishedAt = System.currentTimeMillis() - (1000L * 60 * 60 * 24 * 20) // 20 days ago
        )
        val newExam = MarketplaceExamEntity(
            id = "New", templateId = "T2", title = "New", subject = "S", description = "D", creatorId = "C", price = 0f, visibility = "PUBLIC", 
            downloads = 10, rating = 4.0f, publishedAt = System.currentTimeMillis() // Just now
        )

        val ranked = MarketplaceRankingEngine.rank(listOf(oldExam, newExam))
        
        assertEquals("Newer exam should rank higher given equal downloads/rating", "New", ranked[0].id)
    }
}
