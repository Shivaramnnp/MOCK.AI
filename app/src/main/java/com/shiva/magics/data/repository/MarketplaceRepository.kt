package com.shiva.magics.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.shiva.magics.data.model.PublicTestModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class MarketplaceRepository {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val testsCollection = db.collection("publicTests")

    /** Upload a locally built test to the public Marketplace */
    suspend fun publishTest(
        title: String,
        description: String,
        category: String,
        difficulty: String,
        questionsJson: String,
        questionCount: Int,
        testPrice: Int? = null
    ): Result<PublicTestModel> = withContext(Dispatchers.IO) {
        try {
            val uid = auth.currentUser?.uid ?: throw Exception("Not logged in")
            val displayName = auth.currentUser?.displayName ?: "Anonymous"
            val docRef = testsCollection.document()
            
            val model = PublicTestModel(
                id = docRef.id,
                title = title,
                description = description,
                category = category,
                difficulty = difficulty,
                creatorId = uid,
                creatorName = displayName,
                createdAt = System.currentTimeMillis(),
                questionCount = questionCount,
                questionsJson = questionsJson,
                testPrice = testPrice
            )
            
            docRef.set(model.toFirestoreMap()).await()
            Result.success(model)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Retrieve feed formatted for trending (attempt Count and recency heuristics mapped safely) */
    suspend fun getTrendingTests(limit: Long = 20): Result<List<PublicTestModel>> = withContext(Dispatchers.IO) {
        try {
            val snapshot = testsCollection
                .orderBy("attemptCount", Query.Direction.DESCENDING)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(limit)
                .get()
                .await()
                
            val list = snapshot.documents.mapNotNull { doc ->
                doc.data?.let { PublicTestModel.fromFirestore(doc.id, it) }
            }
            Result.success(list)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Basic filtering search for subject or difficulty */
    suspend fun searchTests(category: String?, difficulty: String?, limit: Long = 20): Result<List<PublicTestModel>> = withContext(Dispatchers.IO) {
        try {
            var query: Query = testsCollection

            if (!category.isNullOrBlank()) {
                query = query.whereEqualTo("category", category)
            }
            if (!difficulty.isNullOrBlank()) {
                query = query.whereEqualTo("difficulty", difficulty)
            }

            val snapshot = query.orderBy("createdAt", Query.Direction.DESCENDING).limit(limit).get().await()
            val list = snapshot.documents.mapNotNull { doc ->
                doc.data?.let { PublicTestModel.fromFirestore(doc.id, it) }
            }
            Result.success(list)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    /** Creator Dashboard: Fetch all tests published by the current user */
    suspend fun getMyPublishedTests(): Result<List<PublicTestModel>> = withContext(Dispatchers.IO) {
        try {
            val uid = auth.currentUser?.uid ?: throw Exception("Not logged in")
            val snapshot = testsCollection
                .whereEqualTo("creatorId", uid)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                doc.data?.let { PublicTestModel.fromFirestore(doc.id, it) }
            }
            Result.success(list)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Utility to increment attempt count when a user launches the test */
    suspend fun incrementTestAttempts(testId: String) = withContext(Dispatchers.IO) {
        try {
            val ref = testsCollection.document(testId)
            db.runTransaction { transaction ->
                val snapshot = transaction.get(ref)
                val newCount = (snapshot.getLong("attemptCount") ?: 0L) + 1
                transaction.update(ref, "attemptCount", newCount)
            }.await()
        } catch (e: Exception) {
            // Logging failure, but don't crash user stream
        }
    }
}
