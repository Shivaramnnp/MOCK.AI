package com.shiva.magics.viewmodel

import android.content.Context
import android.content.SharedPreferences
import androidx.appcompat.app.AppCompatDelegate
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.repository.TestRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val context: Context,
    private val repository: TestRepository
) : ViewModel() {

    private val prefs: SharedPreferences = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)

    private val _themeMode = MutableStateFlow(prefs.getString("theme_mode", "system") ?: "system")
    val themeMode = _themeMode.asStateFlow()

    private val _timerSeconds = MutableStateFlow(prefs.getInt("timer_seconds", 60))
    val timerSeconds = _timerSeconds.asStateFlow()

    private val _shuffleQuestions = MutableStateFlow(prefs.getBoolean("shuffle_questions", false))
    val shuffleQuestions = _shuffleQuestions.asStateFlow()

    private val _defaultCategory = MutableStateFlow(prefs.getString("default_category", "General") ?: "General")
    val defaultCategory = _defaultCategory.asStateFlow()

    private val _questionsPerTest = MutableStateFlow(prefs.getInt("questions_per_test", 0))
    val questionsPerTest = _questionsPerTest.asStateFlow()


    fun setThemeMode(mode: String) {
        _themeMode.value = mode
        prefs.edit().putString("theme_mode", mode).apply()
        val appMode = when (mode) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        AppCompatDelegate.setDefaultNightMode(appMode)
    }

    fun setTimerSeconds(seconds: Int) {
        _timerSeconds.value = seconds
        prefs.edit().putInt("timer_seconds", seconds).apply()
    }

    fun setShuffleQuestions(shuffle: Boolean) {
        _shuffleQuestions.value = shuffle
        prefs.edit().putBoolean("shuffle_questions", shuffle).apply()
    }

    fun setDefaultCategory(category: String) {
        _defaultCategory.value = category
        prefs.edit().putString("default_category", category).apply()
    }

    fun setQuestionsPerTest(count: Int) {
        _questionsPerTest.value = count
        prefs.edit().putInt("questions_per_test", count).apply()
    }


    fun clearAllHistory() {
        viewModelScope.launch {
            repository.deleteAllTests()
        }
    }

    class Factory(private val context: Context, private val repository: TestRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SettingsViewModel(context, repository) as T
        }
    }
}
