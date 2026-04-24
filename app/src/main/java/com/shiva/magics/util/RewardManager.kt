package com.shiva.magics.util

import android.util.Log

/**
 * Phase 6 — Retention & Habit Engine: Reward Manager
 * Manages reward triggers and unlocks based on streak milestones.
 */
object RewardManager {

    private const val TAG = "RewardManager"

    data class Reward(
        val title: String,
        val description: String,
        val milestoneDays: Int,
        val rewardType: String // BADGE, TEST, PREMIUM
    )

    private val milestones = listOf(
        Reward("Bronze Starter", "3-day study streak achieved!", 3, "BADGE"),
        Reward("Silver Scholar", "7-day consistency master!", 7, "BADGE"),
        Reward("Gold Grinder", "14-day unstoppable focus!", 14, "BADGE"),
        Reward("Diamond Dedication", "30-day elite preparation!", 30, "BADGE"),
        Reward("Bonus Practice", "Unlocked an extra AI practice test.", 7, "TEST"),
        Reward("Premium Trial", "Unlocked 24h of premium features.", 14, "PREMIUM")
    )

    fun checkAndUnlockRewards(streakDays: Int) {
        val unlocked = milestones.filter { it.milestoneDays == streakDays }
        
        unlocked.forEach { reward ->
            Log.d(TAG, "🏆 UNLOCKED: ${reward.title} - ${reward.description}")
            TelemetryCollector.record(
                TelemetryCollector.EventType.REWARD_UNLOCKED, 
                reward.title, 
                streakDays.toDouble()
            )
            // In a real app, this would update a 'rewards' table or trigger a UI event
        }
    }
}
