package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.local.MarketplaceExamEntity
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.util.MarketplaceRankingEngine
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * Phase 5 — Week 2: Marketplace ViewModel
 * Manages the discovery engine, search, and ranked feed.
 */
class MarketplaceViewModel(
    private val repository: TestRepository
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    private val _filterSubject = MutableStateFlow<String?>(null)
    val filterSubject = _filterSubject.asStateFlow()

    // 5-minute UI cache for feed items
    private var lastLoadTime: Long = 0
    private val CACHE_TTL_MS = 5 * 60 * 1000L

    @OptIn(FlowPreview::class)
    val rankedFeed: StateFlow<List<MarketplaceExamEntity>> = combine(
        repository.getPublicExams(),
        searchQuery.debounce(300),
        filterSubject
    ) { exams, query, subject ->
        var filtered = exams
        
        // Apply Search
        if (query.isNotEmpty()) {
            filtered = filtered.filter { 
                it.title.contains(query, ignoreCase = true) || 
                it.subject.contains(query, ignoreCase = true) ||
                it.creatorName.contains(query, ignoreCase = true)
            }
        }
        
        // Apply Filter
        if (subject != null) {
            filtered = filtered.filter { it.subject == subject }
        }
        
        // Apply Ranking
        MarketplaceRankingEngine.rank(filtered)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun updateSearch(query: String) {
        _searchQuery.value = query
    }

    fun setFilter(subject: String?) {
        _filterSubject.value = subject
    }

    class Factory(private val repository: TestRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return MarketplaceViewModel(repository) as T
        }
    }
}
