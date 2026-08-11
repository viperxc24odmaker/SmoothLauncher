/**
 * CosmeticsManager
 * 
 * Manages player cosmetics like wings, capes, hats, etc.
 * Handles cosmetic data storage and application.
 * 
 * @module cosmeticsmanager
 */

const ConfigManager = require('./configmanager')
const fs = require('fs-extra')
const path = require('path')

class CosmeticsManager {
    constructor() {
        this.cosmeticsPath = path.join(ConfigManager.getDataPath(), 'cosmetics')
        this.cosmetics = {}
        this.loadCosmetics()
    }

    /**
     * Initialize cosmetics directory
     */
    ensureCosmDir() {
        fs.ensureDirSync(this.cosmeticsPath)
    }

    /**
     * Load all cosmetics
     */
    loadCosmetics() {
        this.ensureCosmDir()
        
        const defaultCosmetics = this.getDefaultCosmetics()
        this.cosmetics = defaultCosmetics

        // Load any custom cosmetics if they exist
        try {
            const userCosmetics = fs.readJsonSync(
                path.join(this.cosmeticsPath, 'user_cosmetics.json')
            )
            this.cosmetics = { ...this.cosmetics, ...userCosmetics }
        } catch (err) {
            // File doesn't exist or error reading, use defaults
        }
    }

    /**
     * Get default cosmetics available in launcher
     */
    getDefaultCosmetics() {
        return {
            capes: {
                default_blue: {
                    id: 'default_blue',
                    name: 'Blue Cape',
                    type: 'cape',
                    texture: 'default_blue.png',
                    unlocked: true
                },
                default_red: {
                    id: 'default_red',
                    name: 'Red Cape',
                    type: 'cape',
                    texture: 'default_red.png',
                    unlocked: true
                },
                makeforge_gold: {
                    id: 'makeforge_gold',
                    name: 'MakeForge Gold Cape',
                    type: 'cape',
                    texture: 'makeforge_gold.png',
                    unlocked: true
                }
            },
            wings: {
                angel_wings: {
                    id: 'angel_wings',
                    name: 'Angel Wings',
                    type: 'wings',
                    model: 'angel_wings.json',
                    unlocked: false
                },
                dragon_wings: {
                    id: 'dragon_wings',
                    name: 'Dragon Wings',
                    type: 'wings',
                    model: 'dragon_wings.json',
                    unlocked: false
                },
                pixel_wings: {
                    id: 'pixel_wings',
                    name: 'Pixel Wings',
                    type: 'wings',
                    model: 'pixel_wings.json',
                    unlocked: true
                }
            },
            accessories: {
                halo: {
                    id: 'halo',
                    name: 'Halo',
                    type: 'accessory',
                    model: 'halo.json',
                    unlocked: false
                },
                crown: {
                    id: 'crown',
                    name: 'Crown',
                    type: 'accessory',
                    model: 'crown.json',
                    unlocked: false
                }
            }
        }
    }

    /**
     * Get cosmetic by ID
     */
    getCosmetic(id) {
        for (const category in this.cosmetics) {
            if (this.cosmetics[category][id]) {
                return this.cosmetics[category][id]
            }
        }
        return null
    }

    /**
     * Get cosmetics by type
     */
    getCosmeticsByType(type) {
        const result = {}
        for (const category in this.cosmetics) {
            for (const id in this.cosmetics[category]) {
                if (this.cosmetics[category][id].type === type) {
                    result[id] = this.cosmetics[category][id]
                }
            }
        }
        return result
    }

    /**
     * Unlock cosmetic for user
     */
    unlockCosmetic(userId, cosmeticId) {
        const config = ConfigManager.load()
        if (!config.cosmetics) config.cosmetics = {}
        if (!config.cosmetics[userId]) config.cosmetics[userId] = []
        
        if (!config.cosmetics[userId].includes(cosmeticId)) {
            config.cosmetics[userId].push(cosmeticId)
            ConfigManager.save(config)
        }
    }

    /**
     * Get unlocked cosmetics for user
     */
    getUserCosmetics(userId) {
        const config = ConfigManager.load()
        return config.cosmetics?.[userId] || []
    }

    /**
     * Equip cosmetic for user
     */
    equipCosmetic(userId, cosmeticId) {
        const config = ConfigManager.load()
        if (!config.equippedCosmetics) config.equippedCosmetics = {}
        
        const cosmetic = this.getCosmetic(cosmeticId)
        if (!cosmetic) return false

        // Only one of each type can be equipped
        const type = cosmetic.type
        config.equippedCosmetics[userId] = config.equippedCosmetics[userId] || {}
        config.equippedCosmetics[userId][type] = cosmeticId

        ConfigManager.save(config)
        return true
    }

    /**
     * Get equipped cosmetics for user
     */
    getEquippedCosmetics(userId) {
        const config = ConfigManager.load()
        return config.equippedCosmetics?.[userId] || {}
    }

    /**
     * Add custom cosmetic (dev/testing)
     */
    addCustomCosmetic(cosmeticData) {
        const userCosmetics = {}
        try {
            fs.readJsonSync(path.join(this.cosmeticsPath, 'user_cosmetics.json'))
        } catch (err) {
            // File doesn't exist
        }

        userCosmetics[cosmeticData.id] = cosmeticData
        fs.writeJsonSync(
            path.join(this.cosmeticsPath, 'user_cosmetics.json'),
            userCosmetics,
            { spaces: 2 }
        )

        this.loadCosmetics()
    }
}

module.exports = new CosmeticsManager()
