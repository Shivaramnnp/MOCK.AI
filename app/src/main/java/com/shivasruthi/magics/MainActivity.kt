package com.shivasruthi.magics

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.DisposableEffect
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.shivasruthi.magics.data.local.AppDatabase
import com.shivasruthi.magics.data.remote.GeminiService
import com.shivasruthi.magics.data.remote.SupadataService
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.ui.screens.*
import com.shivasruthi.magics.ui.theme.MagicSTheme
import com.shivasruthi.magics.viewmodel.EditorViewModel
import com.shivasruthi.magics.viewmodel.HomeViewModel
import com.shivasruthi.magics.viewmodel.ProcessingViewModel
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel

class MainActivity : ComponentActivity() {

    // Manual DI — no Hilt needed
    private val database by lazy { AppDatabase.getDatabase(this) }
    private val repository by lazy { TestRepository(database) }
    private val geminiService by lazy { GeminiService(BuildConfig.GEMINI_API_KEY) }
    private val supadataService by lazy { SupadataService(BuildConfig.YOUTUBE_BACKEND_URL) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)   // Edge-to-edge
        enableEdgeToEdge()

        setContent {
            MagicSTheme {
                val navController = rememberNavController()

                // Shared ViewModels — scoped to Activity
                val homeViewModel: HomeViewModel = viewModel(
                    factory = HomeViewModel.Factory(repository)
                )
                val processingViewModel: ProcessingViewModel = viewModel(
                    factory = ProcessingViewModel.Factory(geminiService, supadataService)
                )
                val editorViewModel: EditorViewModel = viewModel()
                val testPlayerViewModel: TestPlayerViewModel = viewModel()

                DisposableEffect(Unit) {
                    val handleIntent = { intent: Intent ->
                        if (intent.action == Intent.ACTION_SEND) {
                            val type = intent.type ?: ""
                            if (type == "text/plain") {
                                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                                if (sharedText != null) {
                                    val isUrl = android.util.Patterns.WEB_URL.matcher(sharedText).matches()
                                    if (isUrl && (sharedText.contains("youtube.com") || sharedText.contains("youtu.be"))) {
                                        processingViewModel.processYouTubeUrl(sharedText)
                                    } else if (isUrl) {
                                        processingViewModel.processWebUrl(sharedText)
                                    } else {
                                        processingViewModel.generateQuestionsFromText(sharedText, com.shivasruthi.magics.data.model.InputSource.Manual, "Shared Text")
                                    }
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                }
                            } else if (type.startsWith("image/") || type == "application/pdf") {
                                val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                                if (uri != null) {
                                    val contentResolver = contentResolver
                                    val mimeType = contentResolver.getType(uri) ?: type
                                    val cursor = contentResolver.query(uri, null, null, null, null)
                                    var name = "shared_file"
                                    cursor?.use {
                                        if (it.moveToFirst()) {
                                            val index = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                                            if (index != -1) name = it.getString(index)
                                        }
                                    }
                                    processingViewModel.processFile(this@MainActivity, uri, mimeType, name)
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                }
                            }
                        }
                    }

                    handleIntent(intent)
                    val listener = Consumer<Intent> { handleIntent(it) }
                    addOnNewIntentListener(listener)
                    onDispose { removeOnNewIntentListener(listener) }
                }

                NavHost(
                    navController = navController,
                    startDestination = AppRoutes.Home
                ) {
                    composable<AppRoutes.Home> {
                        HomeScreen(
                            navController = navController,
                            homeViewModel = homeViewModel,
                            testPlayerViewModel = testPlayerViewModel,
                            processingViewModel = processingViewModel,
                            editorViewModel = editorViewModel,
                            repository = repository
                        )
                    }
                    composable<AppRoutes.Processing> {
                        ProcessingScreen(
                            navController = navController,
                            viewModel = processingViewModel,
                            editorViewModel = editorViewModel
                        )
                    }
                    composable<AppRoutes.Editor> {
                        EditorScreen(
                            navController = navController,
                            viewModel = editorViewModel,
                            repository = repository
                        )
                    }
                    composable<AppRoutes.TestPlayer> {
                        TestPlayerScreen(
                            navController = navController,
                            viewModel = testPlayerViewModel,
                            repository = repository
                        )
                    }
                    composable<AppRoutes.Results> {
                        ResultsScreen(
                            navController = navController,
                            viewModel = testPlayerViewModel,
                            repository = repository
                        )
                    }
                    composable<AppRoutes.Review> {
                        ReviewScreen(
                            navController = navController,
                            viewModel = testPlayerViewModel
                        )
                    }
                    composable<AppRoutes.Camera> {
                        CameraScreen(
                            navController = navController,
                            processingViewModel = processingViewModel
                        )
                    }
                }
            }
        }
    }
}