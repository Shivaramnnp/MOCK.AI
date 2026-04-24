package com.shiva.magics.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.Primary
import com.shiva.magics.ui.theme.PrimaryVariant

// ── Nav Item data ─────────────────────────────────────────────────────────────

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
    val route: AppRoutes,
    val enabled: Boolean = true
)

private fun teacherItems() = listOf(
    BottomNavItem("Home",      Icons.Default.Home,        Icons.Default.Home,        AppRoutes.Home),
    BottomNavItem("Classes",   Icons.Default.School,      Icons.Default.School,      AppRoutes.Classroom),
    BottomNavItem("Dashboard", Icons.Default.BarChart,    Icons.Default.BarChart,    AppRoutes.TeacherDashboard),
    BottomNavItem("Analytics", Icons.Default.Insights,    Icons.Default.Insights,    AppRoutes.Analytics),
    BottomNavItem("Creator",   Icons.Default.Storefront,  Icons.Default.Storefront,  AppRoutes.CreatorDashboard)
)

private fun studentItems() = listOf(
    BottomNavItem("Home",        Icons.Default.Home,           Icons.Default.Home,        AppRoutes.Home),
    BottomNavItem("Classes",     Icons.Default.Groups,         Icons.Default.Groups,      AppRoutes.Classroom),
    BottomNavItem("Assignments", Icons.AutoMirrored.Filled.Assignment, Icons.AutoMirrored.Filled.Assignment, AppRoutes.StudentAssignments),
    BottomNavItem("Analytics",   Icons.Default.Insights,       Icons.Default.Insights,    AppRoutes.Analytics),
    BottomNavItem("Profile",     Icons.Default.Person,         Icons.Default.Person,      AppRoutes.Profile)
)

private fun learnerItems() = listOf(
    BottomNavItem("Home",      Icons.Default.Home,       Icons.Default.Home,       AppRoutes.Home),
    BottomNavItem("Explore",   Icons.Default.Explore,    Icons.Default.Explore,    AppRoutes.Marketplace),
    BottomNavItem("Analytics", Icons.Default.Insights,   Icons.Default.Insights,   AppRoutes.Analytics),
    BottomNavItem("Profile",   Icons.Default.Person,     Icons.Default.Person,     AppRoutes.Profile)
)

// ── Bottom Nav Bar ────────────────────────────────────────────────────────────

@Composable
fun MockAiBottomNav(
    navController: NavController,
    role: UserRole
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    val items = remember(role) {
        when (role) {
            UserRole.TEACHER -> teacherItems()
            UserRole.STUDENT -> studentItems()
            UserRole.LEARNER -> learnerItems()
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 12.dp,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .height(62.dp)
                .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEach { item ->
                val routeClass = item.route::class.qualifiedName
                val isSelected = currentRoute?.contains(routeClass?.substringAfterLast(".") ?: "") == true
                    || (item.route == AppRoutes.Home && currentRoute?.contains("Home") == true)
                    || (item.route == AppRoutes.Classroom && currentRoute?.contains("Classroom") == true)
                    || (item.route == AppRoutes.Profile && currentRoute?.contains("Profile") == true)
                    || (item.route == AppRoutes.TeacherDashboard && currentRoute?.contains("TeacherDashboard") == true)
                    || (item.route == AppRoutes.StudentAssignments && currentRoute?.contains("StudentAssignments") == true)
                    || (item.route == AppRoutes.Analytics && currentRoute?.contains("Analytics") == true)
                    || (item.route == AppRoutes.Marketplace && currentRoute?.contains("Marketplace") == true)
                    || (item.route == AppRoutes.CreatorDashboard && currentRoute?.contains("CreatorDashboard") == true)

                BottomNavItemView(
                    item = item,
                    isSelected = isSelected,
                    onClick = {
                        if (!isSelected) {
                            navController.navigate(item.route) {
                                // Keep Home as the baseline — don't build up a huge stack
                                popUpTo(AppRoutes.Home) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun RowScope.BottomNavItemView(
    item: BottomNavItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val iconColor by animateColorAsState(
        targetValue = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        animationSpec = tween(200),
        label = "navIconColor"
    )
    val labelColor by animateColorAsState(
        targetValue = if (isSelected) Primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        animationSpec = tween(200),
        label = "navLabelColor"
    )

    NavigationBarItem(
        selected = isSelected,
        onClick = onClick,
        enabled = item.enabled,
        icon = {
            Box(
                modifier = if (isSelected) Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(listOf(Primary, PrimaryVariant))
                    )
                    .padding(horizontal = 14.dp, vertical = 6.dp)
                else Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isSelected) item.selectedIcon else item.icon,
                    contentDescription = item.label,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp)
                )
            }
        },
        label = {
            Text(
                text = item.label,
                fontSize = 10.sp,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                color = labelColor,
                maxLines = 1
            )
        },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor   = Color.Transparent,
            unselectedIconColor = Color.Transparent,
            indicatorColor      = Color.Transparent
        )
    )
}
