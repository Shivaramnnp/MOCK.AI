package com.shiva.magics.util

import android.content.Context
import android.content.Intent
import com.shiva.magics.data.local.ReferralDao
import com.shiva.magics.data.local.ReferralEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Phase 10 — Launch & Growth Infrastructure: Referral Engine
 * Orchestrates viral growth loops via user invitations and rewards.
 */
object ReferralManager {

    /**
     * Generates a sharing intent for the referral link.
     */
    fun shareReferralLink(context: Context, userId: String) {
        val referralLink = "https://mockai.edu/join?ref=$userId"
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Join me on Mock.AI to master your exams with an AI Coach! Use my link: $referralLink")
        }
        context.startActivity(Intent.createChooser(shareIntent, "Invite a Friend"))
        
        TelemetryCollector.record(TelemetryCollector.EventType.REFERRAL_SHARED, "link_shared", 1.0)
    }

    /**
     * Processes a referral when a new user joins.
     */
    suspend fun processReferral(
        dao: ReferralDao,
        inviterId: String,
        inviteeId: String
    ) = withContext(Dispatchers.IO) {
        
        // 1. Record the referral
        val referral = ReferralEntity(
            inviteeId = inviteeId,
            inviterId = inviterId,
            rewardType = "PREMIUM_DAYS"
        )
        dao.insertReferral(referral)

        // 2. Issue reward logic (simulated: mark as issued)
        dao.markRewardIssued(inviteeId)

        // 3. Telemetry
        TelemetryCollector.record(TelemetryCollector.EventType.REFERRAL_CONVERTED, "conversion", 1.0)
    }
}
