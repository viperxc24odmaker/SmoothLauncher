/**
 * InstanceManager
 * 
 * Manages multiple Minecraft game instances
 * Each instance has its own mods, config, saves, and settings
 * 
 * @module instancemanager
 */

const fs = require('fs-extra')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('InstanceManager')

class InstanceManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.instancesDir = path.join(dataPath, 'instances')
        this.instancesConfigPath = path.join(dataPath, 'instances.json')
        fs.ensureDirSync(this.instancesDir)
        this.loadInstances()
    }

    /**
     * Load instances config
     */
    loadInstances() {
        try {
            if (fs.existsSync(this.instancesConfigPath)) {
                this.instances = fs.readJsonSync(this.instancesConfigPath)
            } else {
                this.instances = {}
                this.saveInstances()
            }
        } catch (err) {
            log.error('Failed to load instances:', err)
            this.instances = {}
        }
    }

    /**
     * Save instances config
     */
    saveInstances() {
        try {
            fs.writeJsonSync(this.instancesConfigPath, this.instances, { spaces: 2 })
        } catch (err) {
            log.error('Failed to save instances:', err)
        }
    }

    /**
     * Create a new instance
     */
    createInstance(options) {
        const id = uuidv4().split('-')[0]
        const instanceDir = path.join(this.instancesDir, id)

        const instance = {
            id: id,
            name: options.name || `Instance ${Object.keys(this.instances).length + 1}`,
            mcVersion: options.mcVersion || '1.21.1',
            modLoader: options.modLoader || 'vanilla', // vanilla, fabric, forge, neoforge
            modLoaderVersion: options.modLoaderVersion || null,
            versionId: options.versionId || options.mcVersion,
            createdAt: new Date().toISOString(),
            lastPlayed: null,
            playCount: 0,
            jvmArgs: options.jvmArgs || '-Xmx2G -Xms512M',
            maxMemory: options.maxMemory || 2048, // MB
            minMemory: options.minMemory || 512,  // MB
            resolution: options.resolution || { width: 1280, height: 720 },
            javaPath: options.javaPath || null, // null = auto-detect
            gameDir: instanceDir,
            icon: options.icon || null
        }

        // Create instance directories
        fs.ensureDirSync(instanceDir)
        fs.ensureDirSync(path.join(instanceDir, 'mods'))
        fs.ensureDirSync(path.join(instanceDir, 'config'))
        fs.ensureDirSync(path.join(instanceDir, 'saves'))
        fs.ensureDirSync(path.join(instanceDir, 'resourcepacks'))
        fs.ensureDirSync(path.join(instanceDir, 'shaderpacks'))
        fs.ensureDirSync(path.join(instanceDir, 'screenshots'))
        fs.ensureDirSync(path.join(instanceDir, 'logs'))

        this.instances[id] = instance
        this.saveInstances()

        log.info(`Created instance: ${instance.name} (${id})`)
        return instance
    }

    /**
     * Get instance by ID
     */
    getInstance(id) {
        return this.instances[id] || null
    }

    /**
     * Get all instances
     */
    getAllInstances() {
        return Object.values(this.instances)
    }

    /**
     * Update instance
     */
    updateInstance(id, updates) {
        if (!this.instances[id]) {
            throw new Error(`Instance ${id} not found`)
        }

        this.instances[id] = {
            ...this.instances[id],
            ...updates
        }

        this.saveInstances()
        return this.instances[id]
    }

    /**
     * Delete instance
     */
    deleteInstance(id, deleteFiles = false) {
        if (!this.instances[id]) return false

        if (deleteFiles) {
            const instanceDir = path.join(this.instancesDir, id)
            if (fs.existsSync(instanceDir)) {
                fs.removeSync(instanceDir)
            }
        }

        delete this.instances[id]
        this.saveInstances()
        log.info(`Deleted instance: ${id}`)
        return true
    }

    /**
     * Duplicate instance
     */
    duplicateInstance(id) {
        const original = this.instances[id]
        if (!original) {
            throw new Error(`Instance ${id} not found`)
        }

        const newInstance = this.createInstance({
            ...original,
            name: `${original.name} (Copy)`
        })

        // Copy mods, config, resourcepacks
        const originalDir = path.join(this.instancesDir, id)
        const newDir = path.join(this.instancesDir, newInstance.id)

        const copyDirs = ['mods', 'config', 'resourcepacks', 'shaderpacks']
        for (const dir of copyDirs) {
            const src = path.join(originalDir, dir)
            const dest = path.join(newDir, dir)
            if (fs.existsSync(src)) {
                fs.copySync(src, dest)
            }
        }

        return newInstance
    }

    /**
     * Record play session
     */
    recordPlay(id) {
        if (!this.instances[id]) return

        this.instances[id].lastPlayed = new Date().toISOString()
        this.instances[id].playCount++
        this.saveInstances()
    }

    /**
     * Get instance mods
     */
    getInstanceMods(id) {
        const instance = this.instances[id]
        if (!instance) return []

        const modsDir = path.join(this.instancesDir, id, 'mods')
        if (!fs.existsSync(modsDir)) return []

        return fs.readdirSync(modsDir)
            .filter(f => f.endsWith('.jar'))
            .map(f => ({
                name: f.replace('.jar', ''),
                fileName: f,
                path: path.join(modsDir, f),
                size: fs.statSync(path.join(modsDir, f)).size,
                enabled: !f.endsWith('.disabled')
            }))
    }

    /**
     * Add mod to instance
     */
    addMod(id, modFilePath) {
        const modsDir = path.join(this.instancesDir, id, 'mods')
        fs.ensureDirSync(modsDir)

        const fileName = path.basename(modFilePath)
        const dest = path.join(modsDir, fileName)

        fs.copySync(modFilePath, dest)
        log.info(`Added mod ${fileName} to instance ${id}`)
        return dest
    }

    /**
     * Remove mod from instance
     */
    removeMod(id, modFileName) {
        const modPath = path.join(this.instancesDir, id, 'mods', modFileName)
        if (fs.existsSync(modPath)) {
            fs.removeSync(modPath)
            return true
        }
        return false
    }

    /**
     * Toggle mod enabled/disabled
     */
    toggleMod(id, modFileName) {
        const modsDir = path.join(this.instancesDir, id, 'mods')

        if (modFileName.endsWith('.disabled')) {
            // Enable
            const newName = modFileName.replace('.disabled', '')
            fs.renameSync(
                path.join(modsDir, modFileName),
                path.join(modsDir, newName)
            )
            return { enabled: true, fileName: newName }
        } else {
            // Disable
            const newName = modFileName + '.disabled'
            fs.renameSync(
                path.join(modsDir, modFileName),
                path.join(modsDir, newName)
            )
            return { enabled: false, fileName: newName }
        }
    }

    /**
     * Get instance saves
     */
    getInstanceSaves(id) {
        const savesDir = path.join(this.instancesDir, id, 'saves')
        if (!fs.existsSync(savesDir)) return []

        return fs.readdirSync(savesDir)
            .filter(f => fs.statSync(path.join(savesDir, f)).isDirectory())
            .map(f => ({
                name: f,
                path: path.join(savesDir, f),
                lastModified: fs.statSync(path.join(savesDir, f)).mtime
            }))
    }

    /**
     * Get instance screenshots
     */
    getInstanceScreenshots(id) {
        const ssDir = path.join(this.instancesDir, id, 'screenshots')
        if (!fs.existsSync(ssDir)) return []

        return fs.readdirSync(ssDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
            .map(f => ({
                name: f,
                path: path.join(ssDir, f),
                timestamp: fs.statSync(path.join(ssDir, f)).mtime
            }))
    }

    /**
     * Export instance as JSON
     */
    exportInstance(id) {
        const instance = this.instances[id]
        if (!instance) return null

        return {
            ...instance,
            mods: this.getInstanceMods(id),
            saves: this.getInstanceSaves(id).map(s => s.name)
        }
    }

    /**
     * Get most recently played instances
     */
    getRecentInstances(limit = 5) {
        return this.getAllInstances()
            .filter(i => i.lastPlayed)
            .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))
            .slice(0, limit)
    }

    /**
     * Open instance folder in file explorer
     */
    getInstancePath(id) {
        return path.join(this.instancesDir, id)
    }
}

module.exports = InstanceManager
