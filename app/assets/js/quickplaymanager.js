/**
 * QuickPlayManager
 * 
 * Manages quick play functionality - launch last used instance with one click
 * Stores play history and frequently used instances
 * 
 * @module quickplaymanager
 */

const ConfigManager = require('./configmanager')
const path = require('path')

class QuickPlayManager {
    constructor() {
        this.loadPlayHistory()
    }

    /**
     * Load play history from config
     */
    loadPlayHistory() {
        const config = ConfigManager.load()
        this.playHistory = config.playHistory || []
        this.lastInstance = config.lastPlayedInstance || null
    }

    /**
     * Record instance launch
     */
    recordPlay(instanceName, version) {
        const config = ConfigManager.load()
        
        const playRecord = {
            name: instanceName,
            version: version,
            timestamp: new Date().toISOString(),
            playCount: 0
        }

        // Check if already in history
        const existing = this.playHistory.findIndex(h => h.name === instanceName)
        if (existing !== -1) {
            this.playHistory[existing].playCount++
            this.playHistory[existing].timestamp = playRecord.timestamp
        } else {
            this.playHistory.push(playRecord)
        }

        // Keep last 20 entries
        if (this.playHistory.length > 20) {
            this.playHistory = this.playHistory.slice(-20)
        }

        config.playHistory = this.playHistory
        config.lastPlayedInstance = instanceName
        this.lastInstance = instanceName

        ConfigManager.save(config)
    }

    /**
     * Get last played instance
     */
    getLastInstance() {
        return this.lastInstance
    }

    /**
     * Get most played instances
     */
    getMostPlayed(limit = 5) {
        return this.playHistory
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, limit)
    }

    /**
     * Get recent instances
     */
    getRecent(limit = 5) {
        return [...this.playHistory]
            .reverse()
            .slice(0, limit)
    }

    /**
     * Clear play history
     */
    clearHistory() {
        this.playHistory = []
        const config = ConfigManager.load()
        config.playHistory = []
        config.lastPlayedInstance = null
        this.lastInstance = null
        ConfigManager.save(config)
    }
}

module.exports = new QuickPlayManager()
