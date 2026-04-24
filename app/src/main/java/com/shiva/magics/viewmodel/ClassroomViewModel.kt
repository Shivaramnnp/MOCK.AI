package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.google.firebase.firestore.ListenerRegistration
import com.shiva.magics.data.model.AssignmentModel
import com.shiva.magics.data.model.ClassModel
import com.shiva.magics.data.repository.ClassroomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

// ── UI State ──────────────────────────────────────────────────────────────────

data class ClassroomState(
    val isLoading: Boolean = false,
    val classes: List<ClassModel> = emptyList(),
    val assignments: List<AssignmentModel> = emptyList(),
    val selectedClass: ClassModel? = null,
    val classAssignments: List<AssignmentModel> = emptyList(),
    val snackMessage: String? = null,
    val error: String? = null
)

class ClassroomViewModel(
    private val repo: ClassroomRepository
) : ViewModel() {

    private val _state = MutableStateFlow(ClassroomState())
    val state: StateFlow<ClassroomState> = _state.asStateFlow()

    // Active listeners — removed in onCleared
    private var classListListener: ListenerRegistration? = null
    private var assignmentListener: ListenerRegistration? = null
    private var classDetailListener: ListenerRegistration? = null

    // ── Teacher ───────────────────────────────────────────────────────────────

    /** Start listening to teacher's classes — call from ClassroomScreen */
    fun listenTeacherClasses() {
        classListListener?.remove()
        _state.update { it.copy(isLoading = true) }
        classListListener = repo.listenTeacherClasses(
            onUpdate = { classes ->
                _state.update { it.copy(isLoading = false, classes = classes, error = null) }
            },
            onError = { msg ->
                _state.update { it.copy(isLoading = false, error = msg) }
            }
        )
    }

    /** Create a class; shows snack on result */
    fun createClass(name: String) {
        if (name.isBlank()) {
            _state.update { it.copy(error = "Class name cannot be empty") }
            return
        }
        _state.update { it.copy(isLoading = true, error = null) }
        repo.createClass(name) { result ->
            result.fold(
                onSuccess = { model ->
                    // Optimistic insert: add to local list immediately so UI
                    // updates without waiting for the next Firestore snapshot.
                    _state.update {
                        it.copy(
                            isLoading    = false,
                            classes      = listOf(model) + it.classes,
                            snackMessage = "\"${model.name}\" created! Share code: ${model.joinCode}"
                        )
                    }
                },
                onFailure = { e ->
                    _state.update { it.copy(isLoading = false, error = e.localizedMessage) }
                }
            )
        }
    }

    fun removeStudent(classId: String, studentUid: String) {
        repo.removeStudent(classId, studentUid) { success ->
            if (!success) _state.update { it.copy(error = "Failed to remove student") }
        }
    }

    /** Teacher: create assignment for a class with questions JSON */
    fun createAssignment(
        classId: String,
        className: String,
        testTitle: String,
        questionsJson: String,
        dueDate: Long?
    ) {
        _state.update { it.copy(isLoading = true, error = null) }
        repo.createAssignment(classId, className, testTitle, questionsJson, dueDate) { result ->
            result.fold(
                onSuccess = { _state.update { it.copy(isLoading = false, snackMessage = "Assignment created!") } },
                onFailure = { e -> _state.update { it.copy(isLoading = false, error = e.localizedMessage) } }
            )
        }
    }

    /** Load details (students + assignments) for a specific class */
    fun selectClass(classModel: ClassModel) {
        _state.update { it.copy(selectedClass = classModel, classAssignments = emptyList()) }
        classDetailListener?.remove()
        classDetailListener = repo.listenClassAssignments(
            classId = classModel.classId,
            onUpdate = { assignments ->
                _state.update { it.copy(classAssignments = assignments) }
            },
            onError = { msg ->
                _state.update { it.copy(error = msg) }
            }
        )
    }

    // ── Student ───────────────────────────────────────────────────────────────

    /** Start listening to student's enrolled classes */
    fun listenStudentClasses() {
        classListListener?.remove()
        _state.update { it.copy(isLoading = true) }
        classListListener = repo.listenStudentClasses(
            onUpdate = { classes ->
                _state.update { it.copy(isLoading = false, classes = classes, error = null) }
                refreshStudentAssignments(classes.map { c -> c.classId })
            },
            onError = { msg ->
                _state.update { it.copy(isLoading = false, error = msg) }
            }
        )
    }

    private fun refreshStudentAssignments(classIds: List<String>) {
        assignmentListener?.remove()
        if (classIds.isEmpty()) {
            _state.update { it.copy(assignments = emptyList()) }
            return
        }
        assignmentListener = repo.listenStudentAssignments(
            classIds = classIds,
            onUpdate = { assignments ->
                _state.update { it.copy(assignments = assignments) }
            },
            onError = { msg ->
                _state.update { it.copy(error = msg) }
            }
        )
    }

    /** Student joins a class by code */
    fun joinClass(code: String, studentName: String) {
        if (code.length != 6) {
            _state.update { it.copy(error = "Enter a valid 6-character class code") }
            return
        }
        _state.update { it.copy(isLoading = true, error = null) }
        repo.joinClassByCode(code, studentName) { result ->
            result.fold(
                onSuccess = { model ->
                    _state.update { it.copy(
                        isLoading    = false,
                        snackMessage = "Joined \"${model.name}\"! 🎉"
                    ) }
                },
                onFailure = { e ->
                    _state.update { it.copy(isLoading = false, error = e.localizedMessage) }
                }
            )
        }
    }

    /** Student: record assignment submission */
    fun submitAssignmentResult(assignmentId: String, score: Int, total: Int) {
        repo.submitAssignmentResult(assignmentId, score, total) { success -> 
            if (!success) {
                _state.update { it.copy(error = "Failed to submit assignment result") }
            }
        }
    }

    // ── Shared ────────────────────────────────────────────────────────────────

    fun clearSnack() = _state.update { it.copy(snackMessage = null) }
    fun clearError() = _state.update { it.copy(error = null) }

    override fun onCleared() {
        classListListener?.remove()
        assignmentListener?.remove()
        classDetailListener?.remove()
        super.onCleared()
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    class Factory(private val repo: ClassroomRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ClassroomViewModel(repo) as T
    }
}
