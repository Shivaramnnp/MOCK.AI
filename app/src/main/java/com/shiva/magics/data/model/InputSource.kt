package com.shiva.magics.data.model

sealed class InputSource {
    data object PDF : InputSource()
    data object Image : InputSource()
    data object Manual : InputSource()
    data object Json : InputSource()
    data object Url : InputSource()
    data object YouTube : InputSource()
    data object Topic : InputSource()
    data object Docx : InputSource()
    data object Camera : InputSource()
    data object Audio : InputSource()
    data object ShareIntent : InputSource()
    data object PROMPT : InputSource()
}
