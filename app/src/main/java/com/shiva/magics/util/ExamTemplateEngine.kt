package com.shiva.magics.util

import com.shiva.magics.data.local.ExamSimulationDao
import com.shiva.magics.data.local.ExamTemplateEntity
import com.shiva.magics.data.model.ExamSection
import com.shiva.magics.data.model.ExamTemplate
import com.shiva.magics.data.model.SectionType
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Phase 4 — Week 1: Exam Template Engine
 * Handles the creation and partitioning of structured exams.
 */
object ExamTemplateEngine {

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Creates a structured exam template with divided sections.
     */
    fun createTemplate(
        title: String,
        description: String,
        sections: List<ExamSection>,
        passingScore: Int = 40
    ): ExamTemplate {
        val totalDuration = sections.sumOf { it.durationMinutes }
        return ExamTemplate(
            id = UUID.randomUUID().toString(),
            title = title,
            description = description,
            totalDurationMinutes = totalDuration,
            sections = sections,
            passingScorePercent = passingScore
        )
    }

    /**
     * Persists a template to the database.
     */
    suspend fun saveTemplate(
        template: ExamTemplate,
        dao: ExamSimulationDao
    ) {
        val entity = ExamTemplateEntity(
            id = template.id,
            title = template.title,
            totalDurationMinutes = template.totalDurationMinutes,
            templateJson = json.encodeToString(template)
        )
        dao.insertTemplate(entity)
    }

    /**
     * Helper to quickly build a 3-section standard exam.
     */
    fun buildStandardMock(
        title: String,
        totalQuestions: Int,
        totalMinutes: Int
    ): ExamTemplate {
        val mcqCount = (totalQuestions * 0.5).toInt()
        val numCount = (totalQuestions * 0.3).toInt()
        val subjCount = totalQuestions - mcqCount - numCount

        val mcqDur = (totalMinutes * 0.4).toInt()
        val numDur = (totalMinutes * 0.4).toInt()
        val subjDur = totalMinutes - mcqDur - numDur

        val sections = listOf(
            ExamSection(UUID.randomUUID().toString(), "Section A: Theory", mcqDur, mcqCount, SectionType.MCQ),
            ExamSection(UUID.randomUUID().toString(), "Section B: Numerical", numDur, numCount, SectionType.NUMERICAL),
            ExamSection(UUID.randomUUID().toString(), "Section C: Application", subjDur, subjCount, SectionType.SUBJECTIVE)
        )

        return createTemplate(title, "Standard 3-section mock exam format.", sections)
    }
}
