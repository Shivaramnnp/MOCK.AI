package com.shiva.magics.data.model

enum class SubmissionStatus { PENDING, SUBMITTED }

data class SubmissionData(
    val status: SubmissionStatus = SubmissionStatus.PENDING,
    val score: Int? = null,
    val total: Int? = null,
    val scorePercent: Float? = null,
    val submittedAt: Long? = null
) {
    fun toFirestoreMap(): Map<String, Any?> = mapOf(
        "status"       to status.name,
        "score"        to score,
        "total"        to total,
        "scorePercent" to scorePercent,
        "submittedAt"  to submittedAt
    )

    companion object {
        fun fromFirestoreMap(map: Map<*, *>): SubmissionData = SubmissionData(
            status       = SubmissionStatus.valueOf(
                               map["status"] as? String ?: "PENDING"
                           ),
            score        = (map["score"] as? Number)?.toInt(),
            total        = (map["total"] as? Number)?.toInt(),
            scorePercent = (map["scorePercent"] as? Number)?.toFloat(),
            submittedAt  = (map["submittedAt"] as? Number)?.toLong()
        )
    }
}

data class AssignmentModel(
    val assignmentId: String = "",
    val classId: String = "",
    val className: String = "",
    val testTitle: String = "",
    val assignedBy: String = "",
    val assignedByName: String = "",
    val dueDate: Long? = null,
    val assignedAt: Long = System.currentTimeMillis(),
    val questionsJson: String = "",              // JSON-serialised List<Question>
    val studentSubmissions: Map<String, SubmissionData> = emptyMap()
) {
    /** True if this student has submitted */
    fun isSubmittedBy(uid: String): Boolean =
        studentSubmissions[uid]?.status == SubmissionStatus.SUBMITTED

    val submissionCount: Int get() =
        studentSubmissions.values.count { it.status == SubmissionStatus.SUBMITTED }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromFirestore(id: String, data: Map<String, Any?>): AssignmentModel {
            val subsMap = (data["studentSubmissions"] as? Map<*, *>)
                ?.entries
                ?.associate { (k, v) ->
                    k.toString() to SubmissionData.fromFirestoreMap(v as? Map<*, *> ?: emptyMap<Any, Any>())
                } ?: emptyMap()
            return AssignmentModel(
                assignmentId       = id,
                classId            = data["classId"] as? String ?: "",
                className          = data["className"] as? String ?: "",
                testTitle          = data["testTitle"] as? String ?: "",
                assignedBy         = data["assignedBy"] as? String ?: "",
                assignedByName     = data["assignedByName"] as? String ?: "",
                dueDate            = (data["dueDate"] as? Number)?.toLong(),
                assignedAt         = (data["assignedAt"] as? Number)?.toLong() ?: 0L,
                questionsJson      = data["questionsJson"] as? String ?: "",
                studentSubmissions = subsMap
            )
        }
    }

    fun toFirestoreMap(): Map<String, Any?> = mapOf(
        "assignmentId"       to assignmentId,
        "classId"            to classId,
        "className"          to className,
        "testTitle"          to testTitle,
        "assignedBy"         to assignedBy,
        "assignedByName"     to assignedByName,
        "dueDate"            to dueDate,
        "assignedAt"         to assignedAt,
        "questionsJson"      to questionsJson,
        "studentSubmissions" to studentSubmissions.mapValues { it.value.toFirestoreMap() }
    )
}
