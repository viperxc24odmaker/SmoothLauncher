/**
 * PerformanceMonitor
 * 
 * Monitors launcher and game performance metrics
 * Tracks FPS, memory usage, CPU, and general stats
 * 
 * @module performancemonitor
 */

const ConfigManager = require('./configmanager')

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            fps: 0,
            memory: 0,
            cpu: 0,
            uptime: 0
        }
        this.history = []
        this.isMonitoring = false
        this.startTime = null
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) return

        this.isMonitoring = true
        this.startTime = Date.now()
        this.monitoringInterval = setInterval(() => {
            this.recordMetrics()
        }, 1000) // Update every second
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval)
        }
        this.isMonitoring = false
    }

    /**
     * Record current metrics
     */
    recordMetrics() {
        const memUsage = process.memoryUsage()
        const uptime = Date.now() - this.startTime

        const record = {
            timestamp: new Date().toISOString(),
            memory: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            uptime: Math.floor(uptime / 1000) // seconds
        }

        this.history.push(record)

        // Keep last 3600 records (1 hour at 1 sample/sec)
        if (this.history.length > 3600) {
            this.history.shift()
        }

        return record
    }

    /**
     * Get current metrics
     */
    getCurrentMetrics() {
        if (this.history.length === 0) {
            return this.recordMetrics()
        }
        return this.history[this.history.length - 1]
    }

    /**
     * Get metrics summary
     */
    getSummary() {
        if (this.history.length === 0) return null

        const avgMemory = Math.round(
            this.history.reduce((sum, h) => sum + h.memory, 0) / this.history.length
        )
        const maxMemory = Math.max(...this.history.map(h => h.memory))
        const minMemory = Math.min(...this.history.map(h => h.memory))

        return {
            averageMemory: avgMemory,
            maxMemory: maxMemory,
            minMemory: minMemory,
            currentMemory: this.getCurrentMetrics().memory,
            totalUptime: this.getCurrentMetrics().uptime,
            sampleCount: this.history.length
        }
    }

    /**
     * Get metrics for time range
     */
    getMetricsRange(seconds) {
        const cutoff = Date.now() - (seconds * 1000)
        return this.history.filter(h => 
            new Date(h.timestamp).getTime() >= cutoff
        )
    }

    /**
     * Export metrics as JSON
     */
    exportMetrics() {
        return {
            timestamp: new Date().toISOString(),
            summary: this.getSummary(),
            history: this.history
        }
    }

    /**
     * Clear history
     */
    clearHistory() {
        this.history = []
    }

    /**
     * Get memory usage in percentage
     */
    getMemoryUsagePercent() {
        const current = this.getCurrentMetrics()
        return Math.round((current.memory / current.heapTotal) * 100)
    }
}

module.exports = new PerformanceMonitor()
