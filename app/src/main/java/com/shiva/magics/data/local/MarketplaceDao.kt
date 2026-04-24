package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "marketplace_exams")
data class MarketplaceExamEntity(
    @PrimaryKey val id: String,
    val templateId: String,
    val title: String,
    val subject: String,
    val description: String,
    val creatorId: String,
    val creatorName: String = "Internal",
    val price: Float,
    val visibility: String,
    val downloads: Int = 0,
    val rating: Float = 5.0f,
    val completionRate: Float = 1.0f,
    val difficulty: String = "MEDIUM",
    val publishedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "marketplace_interactions")
data class MarketplaceInteractionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val examId: String,
    val userId: String,
    val action: String, // VIEW, SEARCH, FILTER, START, PURCHASE
    val timestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "creator_revenue")
data class CreatorRevenueEntity(
    @PrimaryKey val creatorId: String,
    val totalSales: Int,
    val totalRevenue: Float,
    val lastUpdatedAt: Long = System.currentTimeMillis()
)

@Dao
interface MarketplaceDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun publishExam(exam: MarketplaceExamEntity)

    @Query("SELECT * FROM marketplace_exams WHERE visibility = 'PUBLIC' ORDER BY publishedAt DESC")
    fun getPublicExams(): Flow<List<MarketplaceExamEntity>>

    @Query("SELECT * FROM marketplace_exams WHERE creatorId = :creatorId")
    fun getExamsByCreator(creatorId: String): Flow<List<MarketplaceExamEntity>>

    @Query("SELECT * FROM creator_revenue WHERE creatorId = :creatorId")
    suspend fun getRevenue(creatorId: String): CreatorRevenueEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun updateRevenue(revenue: CreatorRevenueEntity)

    @Insert
    suspend fun recordInteraction(interaction: MarketplaceInteractionEntity)

    @Query("SELECT * FROM marketplace_exams WHERE visibility = 'PUBLIC' AND (title LIKE '%' || :query || '%' OR subject LIKE '%' || :query || '%')")
    fun searchPublicExams(query: String): Flow<List<MarketplaceExamEntity>>
}
