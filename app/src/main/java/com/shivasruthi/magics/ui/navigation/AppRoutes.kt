package com.shivasruthi.magics.ui.navigation

import kotlinx.serialization.Serializable

sealed class AppRoutes {
    @Serializable data object Home : AppRoutes()
    @Serializable data object Processing : AppRoutes()
    @Serializable data object Editor : AppRoutes()
    @Serializable data object TestPlayer : AppRoutes()
    @Serializable data object Results : AppRoutes()
    @Serializable data object Review : AppRoutes()
    @Serializable data object Camera : AppRoutes()
}
