/**
 * CrashReporter
 * 
 * Automatic crash reporting and error logging
 * Helps diagnose launcher and game issues
 * 
 * @module crashreporter
 */

const fs = require('fs-extra')
const path = require('path')
const ConfigManager = require('./configmanager')

class CrashReporter {
    constructor() {
        this.crashesPath = path.join(ConfigManager.getDataPath(), 'crashes')
        this.logsPath = path.join(ConfigManager.getDataPath(), 'logs')
        this.ensureDirectories()
        this.crashes = []
    }

    /**
     * Ensure crash and logs directories exist
     */
    ensureDirectories() {
        fs.ensureDirSync(this.crashesPath)
        fs.ensureDirSync(this.logsPath)
    }

    /**
     * Log a crash
     */
    reportCrash(error, context = {}) {
        const crash = {
            id: this.generateCrashId(),
            timestamp: new Date().toISOString(),
            message: error.message || String(error),
            stack: error.stack || '',
            context: context,
            launcherVersion: this.getLauncherVersion(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        }

        this.crashes.push(crash)
        this.saveCrash(crash)
        return crash
    }

    /**
     * Generate unique crash ID
     */
    generateCrashId() {
        return `crash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Save crash report to file
     */
    saveCrash(crash) {
        const filename = `${crash.id}.json`
        const filepath = path.join(this.crashesPath, filename)
        
        try {
            fs.writeJsonSync(filepath, crash, { spaces: 2 })
        } catch (err) {
            console.error('Failed to save crash report:', err)
        }
    }

    /**
     * Get all crash reports
     */
    getAllCrashes() {
        try {
            const files = fs.readdirSync(this.crashesPath)
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    try {
                        return fs.readJsonSync(path.join(this.crashesPath, f))
                    } catch (e) {
                        return null
                    }
                })
                .filter(c => c !== null)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        } catch (err) {
            return []
        }
    }

    /**
     * Get recent crashes
     */
    getRecentCrashes(limit = 10) {
        return this.getAllCrashes().slice(0, limit)
    }

    /**
     * Get crash by ID
     */
    getCrashById(id) {
        try {
            const filepath = path.join(this.crashesPath, `${id}.json`)
            return fs.readJsonSync(filepath)
        } catch (err) {
            return null
        }
    }

    /**
     * Delete crash report
     */
    deleteCrash(id) {
        try {
            const filepath = path.join(this.crashesPath, `${id}.json`)
            fs.removeSync(filepath)
            return true
        } catch (err) {
            return false
        }
    }

    /**
     * Clear all crash reports
     */
    clearAllCrashes() {
        try {
            fs.emptyDirSync(this.crashesPath)
            this.crashes = []
            return true
        } catch (err) {
            return false
        }
    }

    /**
     * Log to file
     */
    logToFile(level, message, data = {}) {
        const timestamp = new Date().toISOString()
        const logEntry = {
            timestamp,
            level,
            message,
            data
        }

        const logFile = path.join(
            this.logsPath,
            `launcher_${new Date().toISOString().split('T')[0]}.log`
        )

        try {
            const content = JSON.stringify(logEntry) + '\n'
            fs.appendFileSync(logFile, content)
        } catch (err) {
            console.error('Failed to write log:', err)
        }
    }

    /**
     * Get logs for date
     */
    getLogsForDate(date) {
        try {
            const dateStr = date.toISOString().split('T')[0]
            const logFile = path.join(this.logsPath, `launcher_${dateStr}.log`)
            
            if (!fs.existsSync(logFile)) return []

            const content = fs.readFileSync(logFile, 'utf-8')
            return content
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line)
                    } catch (e) {
                        return null
                    }
                })
                .filter(e => e !== null)
        } catch (err) {
            return []
        }
    }

    /**
     * Generate crash report summary
     */
    generateSummary() {
        const allCrashes = this.getAllCrashes()
        const errorTypes = {}

        allCrashes.forEach(crash => {
            const type = crash.message.split(':')[0]
            errorTypes[type] = (errorTypes[type] || 0) + 1
        })

        return {
            totalCrashes: allCrashes.length,
            lastCrash: allCrashes[0] || null,
            errorTypes: errorTypes,
            generatedAt: new Date().toISOString()
        }
    }

    /**
     * Get launcher version
     */
    getLauncherVersion() {
        try {
            const pkg = require('../../../package.json')
            return pkg.version
        } catch (err) {
            return 'unknown'
        }
    }
}

module.exports = new CrashReporter()
