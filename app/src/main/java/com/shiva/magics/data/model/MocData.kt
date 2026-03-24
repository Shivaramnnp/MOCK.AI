package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

@Serializable
data class MocData(
    val title: String,
    val category: String,
    val questions: List<Question>
)
