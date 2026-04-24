package com.shiva.magics.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.data.local.MarketplaceExamEntity
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.MarketplaceViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketplaceScreen(
    navController: NavController,
    viewModel: MarketplaceViewModel
) {
    val feed by viewModel.rankedFeed.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedFilter by viewModel.filterSubject.collectAsState()

    val subjects = listOf("Science", "Mathematics", "Coding", "History", "Law")

    Scaffold(
        topBar = {
            Column(modifier = Modifier.background(SurfaceElev1)) {
                TopAppBar(
                    title = { Text("Marketplace", fontWeight = FontWeight.Black) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceElev1)
                )
                
                // Search Bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { viewModel.updateSearch(it) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    placeholder = { Text("Search exams, subjects, creators...", color = OnSurfaceMuted) },
                    leadingIcon = { Icon(Icons.Default.Search, null, tint = Primary) },
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = SurfaceElev2,
                        unfocusedContainerColor = SurfaceElev2,
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = Color.Transparent
                    )
                )
                
                // Filter Chips
                LazyRow(
                    modifier = Modifier.padding(bottom = 16.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    item {
                        FilterChip(
                            selected = selectedFilter == null,
                            onClick = { viewModel.setFilter(null) },
                            label = { Text("All") },
                            leadingIcon = if (selectedFilter == null) { { Icon(Icons.Default.FilterList, null, Modifier.size(16.dp)) } } else null
                        )
                    }
                    items(subjects) { subject ->
                        FilterChip(
                            selected = selectedFilter == subject,
                            onClick = { viewModel.setFilter(subject) },
                            label = { Text(subject) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        if (feed.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No exams found", style = MaterialTheme.typography.titleMedium, color = OnSurfaceMuted)
                    Text("Try adjusting your search or filters", style = MaterialTheme.typography.bodySmall, color = OnSurfaceMuted)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .background(Surface),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text("Top Recommendations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                items(feed) { exam ->
                    MarketplaceExamCard(exam) {
                        // TODO: Navigate to detail
                    }
                }
            }
        }
    }
}

@Composable
fun MarketplaceExamCard(exam: MarketplaceExamEntity, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = SurfaceElev1,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(exam.title, fontWeight = FontWeight.Black, fontSize = 18.sp)
                    Text("by ${exam.creatorName} • ${exam.subject}", style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
                }
                Surface(
                    color = Primary.copy(alpha = 0.1f),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = if (exam.price == 0f) "FREE" else "$${exam.price}",
                        color = Primary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Spacer(Modifier.height(12.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Star, null, tint = Color(0xFFFFB300), modifier = Modifier.size(14.dp))
                Text(" ${exam.rating} • ${exam.downloads} attempts", style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
                
                Spacer(Modifier.weight(1f))
                
                Surface(
                    color = SurfaceElev2,
                    shape = MaterialTheme.shapes.extraSmall
                ) {
                    Text(
                        text = exam.difficulty,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
