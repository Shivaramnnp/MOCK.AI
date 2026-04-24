package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "referrals")
data class ReferralEntity(
    @PrimaryKey val inviteeId: String, // The person who joined
    val inviterId: String, // The person who shared the link
    val rewardIssued: Boolean = false,
    val rewardType: String, // "PREMIUM_DAYS", "BONUS_TESTS", etc.
    val timestamp: Long = System.currentTimeMillis()
)

@Dao
interface ReferralDao {
    @Query("SELECT * FROM referrals WHERE inviterId = :userId")
    fun getReferralsByInviter(userId: String): Flow<List<ReferralEntity>>

    @Query("SELECT COUNT(*) FROM referrals WHERE inviterId = :userId")
    suspend fun getReferralCount(userId: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReferral(referral: ReferralEntity)

    @Query("UPDATE referrals SET rewardIssued = 1 WHERE inviteeId = :inviteeId")
    suspend fun markRewardIssued(inviteeId: String)
}
