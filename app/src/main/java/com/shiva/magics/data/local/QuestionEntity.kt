package com.shiva.magics.data.local

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

@Entity(
    tableName = "questions",
    foreignKeys = [ForeignKey(
        entity = TestHistoryEntity::class,
        parentColumns = ["id"],
        childColumns = ["testId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("testId")]
)
data class QuestionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val testId: Long,
    val questionIndex: Int,
    val questionText: String,
    val optionsJson: String,            // JSON array: ["A","B","C","D"]
    val correctAnswerIndex: Int
)

data class TestWithQuestions(
    @Embedded val test: TestHistoryEntity,
    @Relation(parentColumn = "id", entityColumn = "testId")
    val questions: List<QuestionEntity>
)
