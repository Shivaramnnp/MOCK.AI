package com.shiva.magics.data.model

data class ClassModel(
    val classId: String = "",
    val name: String = "",
    val teacherId: String = "",
    val teacherName: String = "",
    val joinCode: String = "",
    val studentIds: List<String> = emptyList(),
    val studentNames: Map<String, String> = emptyMap(),
    val createdAt: Long = System.currentTimeMillis()
) {
    /** Student count shorthand */
    val studentCount: Int get() = studentIds.size

    companion object {
        fun fromFirestore(id: String, data: Map<String, Any?>): ClassModel {
            @Suppress("UNCHECKED_CAST")
            val studentIds   = (data["studentIds"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
            @Suppress("UNCHECKED_CAST")
            val studentNames = (data["studentNames"] as? Map<*, *>)
                ?.entries
                ?.associate { (k, v) -> k.toString() to v.toString() }
                ?: emptyMap()
            return ClassModel(
                classId      = id,
                name         = data["name"] as? String ?: "",
                teacherId    = data["teacherId"] as? String ?: "",
                teacherName  = data["teacherName"] as? String ?: "",
                joinCode     = data["joinCode"] as? String ?: "",
                studentIds   = studentIds,
                studentNames = studentNames,
                createdAt    = data["createdAt"] as? Long ?: 0L
            )
        }
    }

    fun toFirestoreMap(): Map<String, Any?> = mapOf(
        "classId"      to classId,
        "name"         to name,
        "teacherId"    to teacherId,
        "teacherName"  to teacherName,
        "joinCode"     to joinCode,
        "studentIds"   to studentIds,
        "studentNames" to studentNames,
        "createdAt"    to createdAt
    )
}
