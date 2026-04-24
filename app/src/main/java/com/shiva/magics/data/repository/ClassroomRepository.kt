package com.shiva.magics.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.shiva.magics.data.model.AssignmentModel
import com.shiva.magics.data.model.ClassModel
import com.shiva.magics.data.model.SubmissionData
import com.shiva.magics.data.model.SubmissionStatus
import kotlinx.coroutines.tasks.await

class ClassroomRepository {

    private val auth = FirebaseAuth.getInstance()
    private val db   = FirebaseFirestore.getInstance()

    // ── Join Code Generation ──────────────────────────────────────────────────

    fun generateJoinCode(): String {
        val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   // No 0/O/1/I ambiguity
        return (1..6).map { chars.random() }.joinToString("")
    }

    // ── Classes ───────────────────────────────────────────────────────────────

    /** Teacher: create a new class */
    fun createClass(name: String, onResult: (Result<ClassModel>) -> Unit) {
        val uid  = auth.currentUser?.uid ?: return onResult(Result.failure(Exception("Not logged in")))
        val displayName = auth.currentUser?.displayName ?: ""
        val docRef  = db.collection("classes").document()
        val joinCode = generateJoinCode()
        val model = ClassModel(
            classId     = docRef.id,
            name        = name.trim(),
            teacherId   = uid,
            teacherName = displayName,
            joinCode    = joinCode,
            createdAt   = System.currentTimeMillis()
        )
        docRef.set(model.toFirestoreMap())
            .addOnSuccessListener { onResult(Result.success(model)) }
            .addOnFailureListener { onResult(Result.failure(it)) }
    }

    /** Teacher: listen to all classes they own */
    fun listenTeacherClasses(
        onUpdate: (List<ClassModel>) -> Unit,
        onError: (String) -> Unit = {}
    ): ListenerRegistration {
        val uid = auth.currentUser?.uid ?: run { onUpdate(emptyList()); return NoopListenerRegistration }
        return db.collection("classes")
            .whereEqualTo("teacherId", uid)
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    onError(error.localizedMessage ?: "Failed to load classes")
                    return@addSnapshotListener
                }
                val list = snap?.documents?.mapNotNull { doc ->
                    doc.data?.let { ClassModel.fromFirestore(doc.id, it) }
                } ?: emptyList()
                onUpdate(list)
            }
    }

    /** Student: listen to all classes they are enrolled in */
    fun listenStudentClasses(
        onUpdate: (List<ClassModel>) -> Unit,
        onError: (String) -> Unit = {}
    ): ListenerRegistration {
        val uid = auth.currentUser?.uid ?: run { onUpdate(emptyList()); return NoopListenerRegistration }
        return db.collection("classes")
            .whereArrayContains("studentIds", uid)
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    onError(error.localizedMessage ?: "Failed to load classes")
                    return@addSnapshotListener
                }
                val list = snap?.documents?.mapNotNull { doc ->
                    doc.data?.let { ClassModel.fromFirestore(doc.id, it) }
                } ?: emptyList()
                onUpdate(list)
            }
    }

    /** Student: join a class by 6-char code */
    fun joinClassByCode(
        code: String,
        studentName: String,
        onResult: (Result<ClassModel>) -> Unit
    ) {
        val uid = auth.currentUser?.uid ?: return onResult(Result.failure(Exception("Not logged in")))
        db.collection("classes")
            .whereEqualTo("joinCode", code.uppercase().trim())
            .limit(1)
            .get()
            .addOnSuccessListener { snap ->
                val doc = snap.documents.firstOrNull()
                if (doc == null) {
                    onResult(Result.failure(Exception("Class not found. Check the code and try again.")))
                    return@addOnSuccessListener
                }
                val classModel = ClassModel.fromFirestore(doc.id, doc.data ?: emptyMap())
                if (uid in classModel.studentIds) {
                    onResult(Result.failure(Exception("You are already in this class.")))
                    return@addOnSuccessListener
                }
                // Add student atomically
                val newStudentIds   = classModel.studentIds + uid
                val newStudentNames = classModel.studentNames + (uid to studentName)
                doc.reference.update(
                    mapOf(
                        "studentIds"           to newStudentIds,
                        "studentNames.$uid"    to studentName
                    )
                )
                .addOnSuccessListener {
                    onResult(Result.success(classModel.copy(
                        studentIds   = newStudentIds,
                        studentNames = newStudentNames
                    )))
                }
                .addOnFailureListener { onResult(Result.failure(it)) }
            }
            .addOnFailureListener { onResult(Result.failure(it)) }
    }

    /** Teacher: remove a student from a class */
    fun removeStudent(classId: String, studentUid: String, onResult: (Boolean) -> Unit) {
        db.collection("classes").document(classId).get()
            .addOnSuccessListener { doc ->
                val model   = ClassModel.fromFirestore(doc.id, doc.data ?: emptyMap())
                val newIds  = model.studentIds - studentUid
                val newMap  = model.studentNames - studentUid
                doc.reference.update(
                    mapOf("studentIds" to newIds, "studentNames" to newMap)
                )
                .addOnSuccessListener { onResult(true) }
                .addOnFailureListener { onResult(false) }
            }
            .addOnFailureListener { onResult(false) }
    }

    // ── Assignments ───────────────────────────────────────────────────────────

    /** Teacher: create an assignment for a class */
    fun createAssignment(
        classId: String,
        className: String,
        testTitle: String,
        questionsJson: String,
        dueDate: Long?,
        onResult: (Result<AssignmentModel>) -> Unit
    ) {
        val uid         = auth.currentUser?.uid ?: return onResult(Result.failure(Exception("Not logged in")))
        val displayName = auth.currentUser?.displayName ?: ""
        val docRef = db.collection("classAssignments").document()
        val model = AssignmentModel(
            assignmentId   = docRef.id,
            classId        = classId,
            className      = className,
            testTitle      = testTitle,
            assignedBy     = uid,
            assignedByName = displayName,
            dueDate        = dueDate,
            assignedAt     = System.currentTimeMillis(),
            questionsJson  = questionsJson
        )
        docRef.set(model.toFirestoreMap())
            .addOnSuccessListener { onResult(Result.success(model)) }
            .addOnFailureListener { onResult(Result.failure(it)) }
    }

    /** Listen to all assignments for a specific class */
    fun listenClassAssignments(
        classId: String,
        onUpdate: (List<AssignmentModel>) -> Unit,
        onError: (String) -> Unit = {}
    ): ListenerRegistration {
        return db.collection("classAssignments")
            .whereEqualTo("classId", classId)
            .orderBy("assignedAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    onError(error.localizedMessage ?: "Failed to load assignments")
                    return@addSnapshotListener
                }
                val list = snap?.documents?.mapNotNull { doc ->
                    doc.data?.let { AssignmentModel.fromFirestore(doc.id, it) }
                } ?: emptyList()
                onUpdate(list)
            }
    }

    /** Listen to all assignments for a student (across all their classes) */
    fun listenStudentAssignments(
        classIds: List<String>,
        onUpdate: (List<AssignmentModel>) -> Unit,
        onError: (String) -> Unit = {}
    ): ListenerRegistration {
        if (classIds.isEmpty()) { onUpdate(emptyList()); return NoopListenerRegistration }
        // Firestore 'in' query supports up to 10 values
        val limitedIds = classIds.take(10)
        return db.collection("classAssignments")
            .whereIn("classId", limitedIds)
            .orderBy("assignedAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    onError(error.localizedMessage ?: "Failed to load assignments")
                    return@addSnapshotListener
                }
                val list = snap?.documents?.mapNotNull { doc ->
                    doc.data?.let { AssignmentModel.fromFirestore(doc.id, it) }
                } ?: emptyList()
                onUpdate(list)
            }
    }

    /** Student: submit result for an assignment */
    fun submitAssignmentResult(
        assignmentId: String,
        score: Int,
        total: Int,
        onResult: (Boolean) -> Unit
    ) {
        val uid = auth.currentUser?.uid ?: return onResult(false)
        val submission = SubmissionData(
            status       = SubmissionStatus.SUBMITTED,
            score        = score,
            total        = total,
            scorePercent = if (total > 0) score.toFloat() / total * 100f else 0f,
            submittedAt  = System.currentTimeMillis()
        )
        db.collection("classAssignments").document(assignmentId)
            .update("studentSubmissions.$uid", submission.toFirestoreMap())
            .addOnSuccessListener { onResult(true) }
            .addOnFailureListener { onResult(false) }
    }

    /** Direct suspending function for SyncManager offline retry */
    suspend fun submitAssignmentResultDirect(
        assignmentId: String,
        score: Int,
        total: Int
    ): Boolean {
        return try {
            val uid = auth.currentUser?.uid ?: return false
            val submission = SubmissionData(
                status       = SubmissionStatus.SUBMITTED,
                score        = score,
                total        = total,
                scorePercent = if (total > 0) score.toFloat() / total * 100f else 0f,
                submittedAt  = System.currentTimeMillis()
            )
            db.collection("classAssignments").document(assignmentId)
                .update("studentSubmissions.$uid", submission.toFirestoreMap())
                .await()
            true
        } catch (e: Exception) {
            false
        }
    }

    // ── Noop listener for early-return cases ─────────────────────────────────
    private object NoopListenerRegistration : ListenerRegistration {
        override fun remove() {}
    }
}
