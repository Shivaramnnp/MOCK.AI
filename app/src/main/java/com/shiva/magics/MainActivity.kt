package com.shiva.magics

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.shiva.magics.data.local.AppDatabase
import com.shiva.magics.data.remote.GeminiService
import com.shiva.magics.data.remote.YoutubeBackendService
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.screens.*
import com.shiva.magics.ui.screens.VoiceRecorderScreen
import com.shiva.magics.ui.theme.MagicSTheme
import com.shiva.magics.ui.theme.ThemePreference
import com.shiva.magics.viewmodel.EditorViewModel
import com.shiva.magics.viewmodel.HomeViewModel
import com.shiva.magics.viewmodel.ProcessingViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel

class MainActivity : ComponentActivity() {

    // Manual DI — no Hilt needed
    private val database by lazy { AppDatabase.getDatabase(this) }
    private val repository by lazy { TestRepository(database) }
    private val geminiService by lazy { GeminiService(BuildConfig.GEMINI_API_KEY) }
    private val youtubeBackendService by lazy { 
        YoutubeBackendService(
            backendBaseUrl = BuildConfig.YOUTUBE_BACKEND_URL
        ) 
    }
    
    private val groqService by lazy { com.shiva.magics.data.remote.GroqService() }
    private val flashLiteService by lazy { 
        com.shiva.magics.data.remote.GeminiFlashLiteService(BuildConfig.GEMINI_FLASH_LITE_KEY) 
    }
    private val aiProviderManager by lazy {
        com.shiva.magics.data.remote.AiProviderManager(
            geminiService = geminiService,
            groqService = groqService,
            flashLiteService = flashLiteService,
            groqApiKey = BuildConfig.GROQ_API_KEY,
            flashLiteApiKey = BuildConfig.GEMINI_FLASH_LITE_KEY
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        ThemePreference.applyToDelegate(ThemePreference.get(this))
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
                    factory = ProcessingViewModel.Factory(aiProviderManager, youtubeBackendService, geminiService, this)
                )
                val editorViewModel: EditorViewModel = viewModel(
                    factory = EditorViewModel.Factory(geminiService)
                )
                val testPlayerViewModel: TestPlayerViewModel = viewModel()

                DisposableEffect(Unit) {
                    val handleIntent = { intent: Intent ->
                        if (intent.action == Intent.ACTION_SEND) {
                            val type = intent.type ?: ""
                            if (type == "text/plain" || type == "application/json") {
                                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                                if (sharedText != null && sharedText.trim().startsWith("{")) {
                                    processingViewModel.generateQuestionsFromText(
                                        sharedText,
                                        com.shiva.magics.data.model.InputSource.Json,
                                        "Shared Test"
                                    )
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                } else if (sharedText != null) {
                                    val isUrl = android.util.Patterns.WEB_URL.matcher(sharedText).matches()
                                    if (isUrl && (sharedText.contains("youtube.com") || sharedText.contains("youtu.be"))) {
                                        processingViewModel.processYouTubeUrl(sharedText)
                                    } else if (isUrl) {
                                        processingViewModel.processWebUrl(sharedText)
                                    } else {
                                        processingViewModel.generateQuestionsFromText(sharedText, com.shiva.magics.data.model.InputSource.Manual, "Shared Text")
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


                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
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
                                editorViewModel = editorViewModel,
                                testPlayerViewModel = testPlayerViewModel
                            )
                        }
                        composable<AppRoutes.Editor> {
                            EditorScreen(
                                navController = navController,
                                viewModel = editorViewModel,
                                repository = repository
                            )
                        }
                        composable<AppRoutes.TestPlayerWithId> {
                            val route = it.toRoute<AppRoutes.TestPlayerWithId>()
                            // Load data for this ID if not already loaded (useful for direct deep links)
                            LaunchedEffect(route.id) {
                                testPlayerViewModel.loadTestFromDb(route.id, repository)
                            }
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
                        composable<AppRoutes.VoiceRecorder> {
                            VoiceRecorderScreen(
                                navController = navController,
                                processingViewModel = processingViewModel
                            )
                        }
                        composable<AppRoutes.Settings> {
                            SettingsScreen(
                                navController = navController,
                                repository = repository
                            )
                        }
                    }
                }
            }
        }
    }
}