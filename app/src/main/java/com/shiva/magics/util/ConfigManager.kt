package com.shiva.magics.util

import com.shiva.magics.data.local.FeatureFlagDao
import com.shiva.magics.data.local.FeatureFlagEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Phase 11 — Launch Operations: Feature Flag / Kill Switch System
 * Provides emergency controls to disable risky or expensive features in production.
 */
object ConfigManager {

    // Feature Names
    const val FEATURE_AUTO_GENERATION = "auto_generation"
    const val FEATURE_REFERRALS = "referrals"
    const val FEATURE_MARKETPLACE = "marketplace"
    const val FEATURE_AI_COACH = "ai_coach"

    /**
     * Checks if a feature is enabled. Defaults to true if flag is missing.
     */
    suspend fun isFeatureEnabled(
        dao: FeatureFlagDao,
        featureName: String
    ): Boolean = withContext(Dispatchers.IO) {
        return@withContext dao.isFeatureEnabled(featureName) ?: true
    }

    /**
     * Emergency Kill Switch: Disables a feature immediately.
     */
    suspend fun disableFeature(
        dao: FeatureFlagDao,
        featureName: String
    ) = withContext(Dispatchers.IO) {
        dao.setFeatureFlag(FeatureFlagEntity(featureName, false))
    }

    /**
     * Enable Feature: Restores a feature.
     */
    suspend fun enableFeature(
        dao: FeatureFlagDao,
        featureName: String
    ) = withContext(Dispatchers.IO) {
        dao.setFeatureFlag(FeatureFlagEntity(featureName, true))
    }
}
