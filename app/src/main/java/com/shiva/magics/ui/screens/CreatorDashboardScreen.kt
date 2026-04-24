package com.shiva.magics.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shiva.magics.data.local.MarketplaceExamEntity
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.CreatorViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatorDashboardScreen(
    navController: NavController,
    viewModel: CreatorViewModel
) {
    val myExams by viewModel.myPublishedExams.collectAsState()
    val status by viewModel.publishingStatus.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Creator Dashboard", fontWeight = FontWeight.Black) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceElev1)
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* Navigate to Template Selector */ }, containerColor = Primary) {
                Icon(Icons.Default.Add, "Create New")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Surface)
                .padding(16.dp)
        ) {
            // Stats Row
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CreatorStatCard(modifier = Modifier.weight(1f), label = "Published", value = myExams.size.toString(), icon = Icons.Default.CloudDone)
                CreatorStatCard(modifier = Modifier.weight(1f), label = "Marketplace", value = "Live", icon = Icons.Default.Storefront)
            }

            Spacer(Modifier.height(24.dp))

            Text("My Published Content", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))

            if (myExams.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No published content yet.", color = OnSurfaceMuted)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(myExams) { exam ->
                        PublishedExamCard(exam)
                    }
                }
            }
        }

        status?.let {
            AlertDialog(
                onDismissRequest = { viewModel.clearStatus() },
                confirmButton = { TextButton(onClick = { viewModel.clearStatus() }) { Text("OK") } },
                title = { Text("Publishing Update") },
                text = { Text(it) }
            )
        }
    }
}

@Composable
fun CreatorStatCard(modifier: Modifier, label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Surface(
        modifier = modifier,
        color = SurfaceElev1,
        shape = MaterialTheme.shapes.large
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(icon, null, tint = Primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.height(8.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
fun PublishedExamCard(exam: MarketplaceExamEntity) {
    Surface(
        color = SurfaceElev1,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(exam.title, fontWeight = FontWeight.Bold)
                Text(exam.subject, style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
            }
            Text("$${exam.price}", fontWeight = FontWeight.Black, color = Primary)
        }
    }
}
