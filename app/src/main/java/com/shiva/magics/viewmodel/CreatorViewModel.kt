package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.local.MarketplaceExamEntity
import com.shiva.magics.data.model.ExamTemplate
import com.shiva.magics.data.model.Visibility
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.util.PublishingEngine
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * Phase 5 — Week 1: Creator ViewModel
 * Manages the publishing workflow and creator performance tracking.
 */
class CreatorViewModel(
    private val repository: TestRepository
) : ViewModel() {

    private val creatorId = "CURRENT_USER_ID" // Placeholder for Auth

    val myPublishedExams: StateFlow<List<MarketplaceExamEntity>> = 
        repository.getExamsByCreator(creatorId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _publishingStatus = MutableStateFlow<String?>(null)
    val publishingStatus: StateFlow<String?> = _publishingStatus.asStateFlow()

    fun publishTemplate(
        template: ExamTemplate,
        subject: String,
        price: Float,
        visibility: Visibility
    ) {
        if (!PublishingEngine.validateEligibility(template)) {
            _publishingStatus.value = "Ineligible: Minimum 5 questions required."
            return
        }

        viewModelScope.launch {
            try {
                val entity = MarketplaceExamEntity(
                    id = java.util.UUID.randomUUID().toString(),
                    templateId = template.id,
                    title = template.title,
                    subject = subject,
                    description = template.description,
                    creatorId = creatorId,
                    price = price,
                    visibility = visibility.name
                )
                repository.publishExam(entity)
                _publishingStatus.value = "Published Successfully!"
            } catch (e: Exception) {
                _publishingStatus.value = "Publishing Failed: ${e.localizedMessage}"
            }
        }
    }

    fun clearStatus() {
        _publishingStatus.value = null
    }

    class Factory(private val repository: TestRepository) : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
            return CreatorViewModel(repository) as T
        }
    }
}
