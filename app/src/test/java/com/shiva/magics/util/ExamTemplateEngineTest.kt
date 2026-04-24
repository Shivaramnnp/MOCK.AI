package com.shiva.magics.util

import com.shiva.magics.data.local.ExamSimulationDao
import com.shiva.magics.data.model.ExamSection
import com.shiva.magics.data.model.SectionType
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class ExamTemplateEngineTest {

    private val dao = mockk<ExamSimulationDao>()

    @Test
    fun testTemplateCreation_DurationSum() {
        val sections = listOf(
            ExamSection("1", "S1", 30, 10),
            ExamSection("2", "S2", 45, 15)
        )
        val template = ExamTemplateEngine.createTemplate("Final Exam", "Mock desc", sections)
        
        assertEquals(75, template.totalDurationMinutes)
        assertEquals(2, template.sections.size)
    }

    @Test
    fun testStandardMockBuilding() {
        val template = ExamTemplateEngine.buildStandardMock("JEE Mock", 50, 180)
        
        assertEquals(3, template.sections.size)
        assertEquals(180, template.totalDurationMinutes)
        
        // Verification of relative splits
        val mcqSection = template.sections[0]
        assertEquals(SectionType.MCQ, mcqSection.sectionType)
        assertEquals(25, mcqSection.questionCount) // 50 * 0.5
        assertEquals(72, mcqSection.durationMinutes) // 180 * 0.4
    }

    @Test
    fun testSavingTemplate() = runBlocking {
        val template = ExamTemplateEngine.buildStandardMock("Test", 10, 60)
        coEvery { dao.insertTemplate(any()) } just Runs
        
        ExamTemplateEngine.saveTemplate(template, dao)
        
        coVerify { dao.insertTemplate(match { it.id == template.id && it.title == "Test" }) }
    }
}
