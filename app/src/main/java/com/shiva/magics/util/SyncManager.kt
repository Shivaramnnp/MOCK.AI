package com.shiva.magics.util

import com.shiva.magics.data.local.OfflineAssignmentDao
import com.shiva.magics.data.local.OfflineAssignmentEntity
import com.shiva.magics.data.repository.ClassroomRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SyncManager(
    private val offlineDao: OfflineAssignmentDao,
    private val classroomRepository: ClassroomRepository
) {
    suspend fun queueAssignmentSubmission(assignmentId: String, score: Int, total: Int) = withContext(Dispatchers.IO) {
        // Try submitting directly to Firestore
        val success = classroomRepository.submitAssignmentResultDirect(assignmentId, score, total)
        if (!success) {
            // Queue locally if it fails (e.g. no internet)
            offlineDao.insertOrUpdate(
                OfflineAssignmentEntity(
                    assignmentId = assignmentId,
                    score = score,
                    total = total,
                    isSynced = false
                )
            )
        }
    }

    suspend fun syncPendingSubmissions() = withContext(Dispatchers.IO) {
        val pending = offlineDao.getUnsyncedAssignments()
        for (submission in pending) {
            val success = classroomRepository.submitAssignmentResultDirect(
                assignmentId = submission.assignmentId,
                score = submission.score,
                total = submission.total
            )
            if (success) {
                offlineDao.markAsSynced(submission.assignmentId)
            }
        }
        // Clean up
        offlineDao.deleteSyncedLogs()
    }
}
