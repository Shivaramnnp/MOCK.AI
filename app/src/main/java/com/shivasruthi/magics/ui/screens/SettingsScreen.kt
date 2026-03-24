package com.shivasruthi.magics.ui.screens

import android.app.Activity
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.shivasruthi.magics.BuildConfig
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.theme.*
import com.shivasruthi.magics.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    repository: TestRepository,
    viewModel: SettingsViewModel = viewModel(
        factory = SettingsViewModel.Factory(LocalContext.current, repository)
    )
) {
    val context = LocalContext.current
    var themeMode by remember {
        mutableStateOf(ThemePreference.get(context))
    }
    val timerSeconds by viewModel.timerSeconds.collectAsState()
    val shuffleQuestions by viewModel.shuffleQuestions.collectAsState()
    val defaultCategory by viewModel.defaultCategory.collectAsState()
    val questionsPerTest by viewModel.questionsPerTest.collectAsState()

    var showClearConfirm by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Surface,
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // SECTION 1: Test
            item {
                SettingsSection(title = "TEST") {
                    // Timer Slider
                    val timerLabels = listOf("Off", "30s", "1m", "2m", "3m", "5m")
                    val timerValues = listOf(0, 30, 60, 120, 180, 300)
                    val currentIndex = timerValues.indexOf(timerSeconds).coerceIn(0, 5)
                    
                    SettingsSliderRow(
                        title = "Timer per question",
                        subtitle = "Time allowed for each MCQ",
                        value = currentIndex.toFloat(),
                        valueRange = 0f..5f,
                        steps = 4,
                        displayValue = timerLabels[currentIndex],
                        onValueChange = { viewModel.setTimerSeconds(timerValues[it.toInt()]) }
                    )

                    HorizontalDivider(color = Border, thickness = 0.5.dp)

                    // Shuffle Toggle
                    SettingsSwitchRow(
                        title = "Shuffle questions",
                        subtitle = "Randomize sequence in every new test",
                        checked = shuffleQuestions,
                        onCheckedChange = { viewModel.setShuffleQuestions(it) }
                    )

                    HorizontalDivider(color = Border, thickness = 0.5.dp)

                    // Default Category Dropdown
                    val categories = listOf("JEE", "NEET", "UPSC", "General", "Other")
                    SettingsDropdownRow(
                        title = "Default category",
                        subtitle = "Automatically applied to new tests",
                        selectedValue = defaultCategory,
                        options = categories,
                        onSelect = { viewModel.setDefaultCategory(it) }
                    )

                    HorizontalDivider(color = Border, thickness = 0.5.dp)

                    // Questions per test
                    val qLabels = listOf("5", "10", "15", "20", "25", "All")
                    val qValues = listOf(5, 10, 15, 20, 25, 0)
                    val qIndex = qValues.indexOf(questionsPerTest).coerceIn(0, 5)
                    
                    SettingsSliderRow(
                        title = "Questions per test",
                        subtitle = "Trim generated list to this size",
                        value = qIndex.toFloat(),
                        valueRange = 0f..5f,
                        steps = 4,
                        displayValue = qLabels[qIndex],
                        onValueChange = { viewModel.setQuestionsPerTest(qValues[it.toInt()]) }
                    )
                }
            }

            // SECTION 3: App
            item {
                SettingsSection(title = "APP") {
                    SettingsSegmentedRow(
                        title = "Theme",
                        subtitle = "Switch between light and dark modes",
                        options = listOf("system" to "System", "light" to "Light", "dark" to "Dark"),
                        selectedValue = themeMode,
                        onSelect = { newValue ->
                            themeMode = newValue
                            ThemePreference.set(context, newValue)
                            (context as? Activity)?.recreate()
                        }
                    )
                }
            }

            // SECTION 4: Data
            item {
                SettingsSection(title = "DATA") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Clear history", fontWeight = FontWeight.Bold, color = OnSurface)
                            Text("Delete all tests and results", style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
                        }
                        OutlinedButton(
                            onClick = { showClearConfirm = true },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                            border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(Color.Red.copy(alpha = 0.3f)))
                        ) {
                            Text("Clear All")
                        }
                    }

                    HorizontalDivider(color = Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("App version", fontWeight = FontWeight.Medium, color = OnSurfaceMuted)
                        Text(BuildConfig.VERSION_NAME, fontWeight = FontWeight.Bold, color = OnSurface)
                    }
                }
            }
        }
    }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Clear All History?") },
            text = { Text("This will permanently delete all your generated tests and performance history. This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.clearAllHistory()
                        showClearConfirm = false
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.Red)
                ) {
                    Text("Delete Everything")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearConfirm = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            ),
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
        )
        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                content()
            }
        }
    }
}

@Composable
fun SettingsSliderRow(
    title: String,
    subtitle: String,
    value: Float,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int,
    displayValue: String,
    onValueChange: (Float) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, color = OnSurface)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
            }
            Text(
                displayValue,
                fontWeight = FontWeight.ExtraBold,
                color = Primary,
                fontSize = 18.sp
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = valueRange,
            steps = steps,
            colors = SliderDefaults.colors(
                thumbColor = Primary,
                activeTrackColor = Primary,
                inactiveTrackColor = SurfaceElev3,
                activeTickColor = Color.Transparent,
                inactiveTickColor = Color.Transparent
            )
        )
    }
}

@Composable
fun SettingsSwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold, color = OnSurface)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = Primary,
                uncheckedThumbColor = OnSurfaceMuted,
                uncheckedTrackColor = SurfaceElev3
            )
        )
    }
}

@Composable
fun SettingsDropdownRow(
    title: String,
    subtitle: String,
    selectedValue: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold, color = OnSurface)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
        }
        Box {
            TextButton(
                onClick = { expanded = true },
                colors = ButtonDefaults.textButtonColors(contentColor = Primary)
            ) {
                Text(selectedValue, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.ArrowDropDown, null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            onSelect(option)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsSegmentedRow(
    title: String,
    subtitle: String,
    options: List<Pair<String, String>>,
    selectedValue: String,
    onSelect: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(title, fontWeight = FontWeight.Bold, color = OnSurface)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceElev3)
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            options.forEach { (id, label) ->
                val isSelected = id == selectedValue
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isSelected) Primary else Color.Transparent)
                        .clickable { onSelect(id) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label,
                        color = if (isSelected) Color.White else OnSurfaceMuted,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsRadioGroup(
    title: String,
    subtitle: String,
    options: List<Pair<String, String>>,
    selectedValue: String,
    onSelect: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(title, fontWeight = FontWeight.Bold, color = OnSurface)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
        Spacer(Modifier.height(8.dp))
        options.forEach { (id, label) ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(id) }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                RadioButton(
                    selected = (id == selectedValue),
                    onClick = { onSelect(id) },
                    colors = RadioButtonDefaults.colors(selectedColor = Primary)
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (id == selectedValue) OnSurface else OnSurfaceMuted
                )
            }
        }
    }
}
