/**
 * OfflineAuthManager
 * 
 * Testing/Development auth mode for the MakeForge Launcher.
 * Provides mock accounts without needing real Microsoft/Mojang authentication.
 * 
 * @module offlineauthmanager
 */

const ConfigManager = require('./configmanager')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs-extra')
const path = require('path')

class OfflineAuthManager {
    constructor() {
        this.testAccountsPath = path.join(ConfigManager.getDataPath(), 'test_accounts.json')
        this.loadTestAccounts()
    }

    /**
     * Load test accounts from storage
     */
    loadTestAccounts() {
        try {
            if (fs.existsSync(this.testAccountsPath)) {
                this.testAccounts = fs.readJsonSync(this.testAccountsPath)
            } else {
                this.testAccounts = this.getDefaultTestAccounts()
                this.saveTestAccounts()
            }
        } catch (err) {
            console.error('Failed to load test accounts:', err)
            this.testAccounts = this.getDefaultTestAccounts()
        }
    }

    /**
     * Get default test accounts for new installations
     */
    getDefaultTestAccounts() {
        return {
            'TestPlayer1': {
                username: 'TestPlayer1',
                uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
                accessToken: this.generateToken(),
                clientToken: this.generateToken(),
                profileName: 'TestPlayer1',
                offlineMode: true,
                createdAt: new Date().toISOString()
            },
            'TestPlayer2': {
                username: 'TestPlayer2',
                uuid: 'ffffffff-ffff-ffff-ffff-fffffffffffe',
                accessToken: this.generateToken(),
                clientToken: this.generateToken(),
                profileName: 'TestPlayer2',
                offlineMode: true,
                createdAt: new Date().toISOString()
            }
        }
    }

    /**
     * Generate a random token for testing
     */
    generateToken() {
        return uuidv4().replace(/-/g, '')
    }

    /**
     * Save test accounts to storage
     */
    saveTestAccounts() {
        try {
            fs.ensureDirSync(path.dirname(this.testAccountsPath))
            fs.writeJsonSync(this.testAccountsPath, this.testAccounts, { spaces: 2 })
        } catch (err) {
            console.error('Failed to save test accounts:', err)
        }
    }

    /**
     * Create a new test account
     */
    createTestAccount(username) {
        if (this.testAccounts[username]) {
            throw new Error(`Test account '${username}' already exists`)
        }

        this.testAccounts[username] = {
            username: username,
            uuid: `ffffffff-ffff-ffff-ffff-${Math.random().toString(16).slice(2).padEnd(12, '0')}`,
            accessToken: this.generateToken(),
            clientToken: this.generateToken(),
            profileName: username,
            offlineMode: true,
            createdAt: new Date().toISOString()
        }

        this.saveTestAccounts()
        return this.testAccounts[username]
    }

    /**
     * Get a test account
     */
    getTestAccount(username) {
        return this.testAccounts[username] || null
    }

    /**
     * Get all test accounts
     */
    getAllTestAccounts() {
        return Object.values(this.testAccounts)
    }

    /**
     * Delete a test account
     */
    deleteTestAccount(username) {
        if (this.testAccounts[username]) {
            delete this.testAccounts[username]
            this.saveTestAccounts()
            return true
        }
        return false
    }

    /**
     * Validate offline test mode is enabled in config
     */
    static isOfflineTestingEnabled() {
        const config = ConfigManager.load()
        return config.offlineTestingMode === true
    }

    /**
     * Toggle offline testing mode
     */
    static setOfflineTestingMode(enabled) {
        const config = ConfigManager.load()
        config.offlineTestingMode = enabled
        ConfigManager.save(config)
    }
}

module.exports = new OfflineAuthManager()
