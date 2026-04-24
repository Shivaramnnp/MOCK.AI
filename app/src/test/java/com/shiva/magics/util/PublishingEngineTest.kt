package com.shiva.magics.util

import com.shiva.magics.data.local.MarketplaceDao
import com.shiva.magics.data.model.ExamSection
import com.shiva.magics.data.model.ExamTemplate
import com.shiva.magics.data.model.Visibility
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class PublishingEngineTest {

    private val marketplaceDao = mockk<MarketplaceDao>()

    @Test
    fun testEligibility_MinimumQuestions() {
        val weakTemplate = ExamTemplate(
            id = "1",
            title = "Weak",
            description = "Desc",
            totalDurationMinutes = 30,
            sections = listOf(ExamSection("1", "S1", 30, 2)) // Only 2 questions
        )
        
        val strongTemplate = ExamTemplate(
            id = "2",
            title = "Strong",
            description = "Desc",
            totalDurationMinutes = 60,
            sections = listOf(ExamSection("1", "S1", 60, 10)) // 10 questions
        )

        assertFalse("Template with <5 questions should be ineligible", PublishingEngine.validateEligibility(weakTemplate))
        assertTrue("Template with >=5 questions should be eligible", PublishingEngine.validateEligibility(strongTemplate))
    }

    @Test
    fun testPublishingFlow() = runBlocking {
        val template = ExamTemplate(
            id = "TEMP_1",
            title = "Marketplace Mock",
            description = "High quality mock",
            totalDurationMinutes = 60,
            sections = listOf(ExamSection("1", "S1", 60, 10))
        )

        coEvery { marketplaceDao.publishExam(any()) } just Runs
        
        val publishedId = PublishingEngine.publish(
            template = template,
            subject = "Science",
            price = 9.99f,
            visibility = Visibility.PUBLIC,
            marketplaceDao = marketplaceDao
        )

        assertNotNull(publishedId)
        coVerify { marketplaceDao.publishExam(match { 
            it.templateId == "TEMP_1" && 
            it.subject == "Science" && 
            it.price == 9.99f &&
            it.visibility == "PUBLIC"
        }) }
    }
}
