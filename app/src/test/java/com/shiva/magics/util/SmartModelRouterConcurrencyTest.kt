package com.shiva.magics.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch

class SmartModelRouterConcurrencyTest {

    @Test
    fun testConcurrentAccessDoesNotThrowCME() = runBlocking {
        SmartModelRouter.reset()
        val provider = SmartModelRouter.Provider.GEMINI_FLASH
        val numThreads = 100
        val requestsPerThread = 100

        val latch = CountDownLatch(1)
        val jobs = List(numThreads) {
            launch(Dispatchers.Default) {
                latch.await()
                for (i in 0 until requestsPerThread) {
                    if (i % 2 == 0) {
                        SmartModelRouter.recordSuccess(provider, 150L)
                    } else {
                        SmartModelRouter.recordFailure(provider, "Timeout")
                    }
                    SmartModelRouter.recommend(hasImageData = true)
                    SmartModelRouter.getHealthReport()
                }
            }
        }

        latch.countDown()
        jobs.forEach { it.join() }

        val report = SmartModelRouter.getHealthReport()
        assertTrue(report.isNotEmpty())
    }
}
