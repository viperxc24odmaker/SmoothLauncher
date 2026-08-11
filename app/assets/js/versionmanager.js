/**
 * VersionManager
 * 
 * Fetches Minecraft version manifest from Mojang
 * Downloads version JSONs and client jars
 * 
 * @module versionmanager
 */

const got = require('got')
const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('VersionManager')

const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

class VersionManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.versionsDir = path.join(dataPath, 'versions')
        this.manifest = null
        fs.ensureDirSync(this.versionsDir)
    }

    /**
     * Fetch version manifest from Mojang
     */
    async fetchManifest() {
        try {
            log.info('Fetching version manifest from Mojang...')
            const response = await got(MOJANG_VERSION_MANIFEST, { responseType: 'json' })
            this.manifest = response.body
            log.info(`Fetched ${this.manifest.versions.length} versions`)
            return this.manifest
        } catch (err) {
            log.error('Failed to fetch version manifest:', err)
            throw err
        }
    }

    /**
     * Get all available versions
     */
    async getVersions(type = null) {
        if (!this.manifest) {
            await this.fetchManifest()
        }

        if (type) {
            return this.manifest.versions.filter(v => v.type === type)
        }
        return this.manifest.versions
    }

    /**
     * Get release versions only
     */
    async getReleases() {
        return this.getVersions('release')
    }

    /**
     * Get snapshot versions only
     */
    async getSnapshots() {
        return this.getVersions('snapshot')
    }

    /**
     * Get latest release version
     */
    async getLatestRelease() {
        if (!this.manifest) {
            await this.fetchManifest()
        }
        return this.manifest.latest.release
    }

    /**
     * Get latest snapshot version
     */
    async getLatestSnapshot() {
        if (!this.manifest) {
            await this.fetchManifest()
        }
        return this.manifest.latest.snapshot
    }

    /**
     * Get version info from manifest
     */
    async getVersionInfo(versionId) {
        if (!this.manifest) {
            await this.fetchManifest()
        }
        return this.manifest.versions.find(v => v.id === versionId) || null
    }

    /**
     * Download version JSON (contains libraries, assets, download URLs)
     */
    async downloadVersionJson(versionId) {
        const versionInfo = await this.getVersionInfo(versionId)
        if (!versionInfo) {
            throw new Error(`Version ${versionId} not found in manifest`)
        }

        const versionDir = path.join(this.versionsDir, versionId)
        const jsonPath = path.join(versionDir, `${versionId}.json`)

        // Check if already downloaded
        if (fs.existsSync(jsonPath)) {
            log.info(`Version JSON already exists: ${versionId}`)
            return fs.readJsonSync(jsonPath)
        }

        log.info(`Downloading version JSON for ${versionId}...`)
        fs.ensureDirSync(versionDir)

        const response = await got(versionInfo.url, { responseType: 'json' })
        fs.writeJsonSync(jsonPath, response.body, { spaces: 2 })

        log.info(`Downloaded version JSON: ${versionId}`)
        return response.body
    }

    /**
     * Download client jar
     */
    async downloadClientJar(versionId, onProgress) {
        const versionJson = await this.downloadVersionJson(versionId)
        const clientDownload = versionJson.downloads.client

        const versionDir = path.join(this.versionsDir, versionId)
        const jarPath = path.join(versionDir, `${versionId}.jar`)

        // Check if already downloaded and valid
        if (fs.existsSync(jarPath)) {
            const existingHash = await this.getFileHash(jarPath)
            if (existingHash === clientDownload.sha1) {
                log.info(`Client jar already exists and is valid: ${versionId}`)
                return jarPath
            }
        }

        log.info(`Downloading client jar for ${versionId} (${this.formatSize(clientDownload.size)})...`)
        fs.ensureDirSync(versionDir)

        const writeStream = fs.createWriteStream(jarPath)
        const downloadStream = got.stream(clientDownload.url)

        let downloaded = 0
        downloadStream.on('downloadProgress', (progress) => {
            downloaded = progress.transferred
            if (onProgress) {
                onProgress({
                    downloaded: downloaded,
                    total: clientDownload.size,
                    percent: Math.round((downloaded / clientDownload.size) * 100)
                })
            }
        })

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream)
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
            downloadStream.on('error', reject)
        })

        // Verify hash
        const hash = await this.getFileHash(jarPath)
        if (hash !== clientDownload.sha1) {
            fs.removeSync(jarPath)
            throw new Error(`Hash mismatch for client jar ${versionId}`)
        }

        log.info(`Downloaded client jar: ${versionId}`)
        return jarPath
    }

    /**
     * Download asset index
     */
    async downloadAssetIndex(versionId) {
        const versionJson = await this.downloadVersionJson(versionId)
        const assetIndex = versionJson.assetIndex

        const assetsDir = path.join(this.dataPath, 'assets', 'indexes')
        const indexPath = path.join(assetsDir, `${assetIndex.id}.json`)

        if (fs.existsSync(indexPath)) {
            log.info(`Asset index already exists: ${assetIndex.id}`)
            return fs.readJsonSync(indexPath)
        }

        log.info(`Downloading asset index ${assetIndex.id}...`)
        fs.ensureDirSync(assetsDir)

        const response = await got(assetIndex.url, { responseType: 'json' })
        fs.writeJsonSync(indexPath, response.body, { spaces: 2 })

        return response.body
    }

    /**
     * Download all assets for a version
     */
    async downloadAssets(versionId, onProgress) {
        const assetIndex = await this.downloadAssetIndex(versionId)
        const objects = assetIndex.objects
        const objectKeys = Object.keys(objects)
        const total = objectKeys.length
        let completed = 0

        const objectsDir = path.join(this.dataPath, 'assets', 'objects')
        fs.ensureDirSync(objectsDir)

        log.info(`Downloading ${total} assets for ${versionId}...`)

        // Download in batches of 10
        const batchSize = 10
        for (let i = 0; i < objectKeys.length; i += batchSize) {
            const batch = objectKeys.slice(i, i + batchSize)
            await Promise.all(batch.map(async (key) => {
                const obj = objects[key]
                const hash = obj.hash
                const subDir = hash.substring(0, 2)
                const objDir = path.join(objectsDir, subDir)
                const objPath = path.join(objDir, hash)

                if (fs.existsSync(objPath)) {
                    completed++
                    return
                }

                fs.ensureDirSync(objDir)
                const url = `https://resources.download.minecraft.net/${subDir}/${hash}`

                try {
                    const response = await got(url, { responseType: 'buffer' })
                    fs.writeFileSync(objPath, response.body)
                } catch (err) {
                    log.warn(`Failed to download asset ${key}: ${err.message}`)
                }

                completed++
                if (onProgress) {
                    onProgress({
                        completed,
                        total,
                        percent: Math.round((completed / total) * 100)
                    })
                }
            }))
        }

        log.info(`Downloaded ${completed}/${total} assets`)
        return completed
    }

    /**
     * Download all libraries for a version
     */
    async downloadLibraries(versionId, onProgress) {
        const versionJson = await this.downloadVersionJson(versionId)
        const libraries = versionJson.libraries
        const librariesDir = path.join(this.dataPath, 'libraries')
        fs.ensureDirSync(librariesDir)

        let completed = 0
        const total = libraries.length
        const downloadedPaths = []

        log.info(`Downloading ${total} libraries for ${versionId}...`)

        for (const lib of libraries) {
            // Check rules (OS-specific libraries)
            if (!this.checkLibraryRules(lib)) {
                completed++
                continue
            }

            const artifact = lib.downloads?.artifact
            if (!artifact) {
                completed++
                continue
            }

            const libPath = path.join(librariesDir, artifact.path)
            downloadedPaths.push(libPath)

            if (fs.existsSync(libPath)) {
                completed++
                if (onProgress) {
                    onProgress({ completed, total, percent: Math.round((completed / total) * 100) })
                }
                continue
            }

            fs.ensureDirSync(path.dirname(libPath))

            try {
                const response = await got(artifact.url, { responseType: 'buffer' })
                fs.writeFileSync(libPath, response.body)
            } catch (err) {
                log.warn(`Failed to download library ${lib.name}: ${err.message}`)
            }

            completed++
            if (onProgress) {
                onProgress({ completed, total, percent: Math.round((completed / total) * 100) })
            }
        }

        // Handle natives
        for (const lib of libraries) {
            if (!lib.natives) continue
            if (!this.checkLibraryRules(lib)) continue

            const platform = this.getCurrentPlatform()
            const nativeKey = lib.natives[platform]
            if (!nativeKey) continue

            const classifier = lib.downloads?.classifiers?.[nativeKey]
            if (!classifier) continue

            const nativePath = path.join(librariesDir, classifier.path)
            if (!fs.existsSync(nativePath)) {
                fs.ensureDirSync(path.dirname(nativePath))
                try {
                    const response = await got(classifier.url, { responseType: 'buffer' })
                    fs.writeFileSync(nativePath, response.body)
                } catch (err) {
                    log.warn(`Failed to download native ${lib.name}: ${err.message}`)
                }
            }
            downloadedPaths.push(nativePath)
        }

        log.info(`Downloaded ${completed}/${total} libraries`)
        return downloadedPaths
    }

    /**
     * Check if library should be included based on rules
     */
    checkLibraryRules(lib) {
        if (!lib.rules) return true

        let dominated = false
        for (const rule of lib.rules) {
            if (rule.os) {
                const platform = this.getCurrentPlatform()
                if (rule.action === 'allow') {
                    if (rule.os.name === platform) {
                        dominated = true
                    }
                } else if (rule.action === 'disallow') {
                    if (rule.os.name === platform) {
                        return false
                    }
                }
            } else {
                if (rule.action === 'allow') {
                    dominated = true
                }
            }
        }
        return dominated
    }

    /**
     * Get current platform string for Mojang
     */
    getCurrentPlatform() {
        switch (process.platform) {
            case 'win32': return 'windows'
            case 'darwin': return 'osx'
            case 'linux': return 'linux'
            default: return 'linux'
        }
    }

    /**
     * Get SHA1 hash of file
     */
    async getFileHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1')
            const stream = fs.createReadStream(filePath)
            stream.on('data', (data) => hash.update(data))
            stream.on('end', () => resolve(hash.digest('hex')))
            stream.on('error', reject)
        })
    }

    /**
     * Format bytes to human readable
     */
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    /**
     * Get installed versions
     */
    getInstalledVersions() {
        if (!fs.existsSync(this.versionsDir)) return []

        return fs.readdirSync(this.versionsDir)
            .filter(dir => {
                const jsonPath = path.join(this.versionsDir, dir, `${dir}.json`)
                return fs.existsSync(jsonPath)
            })
            .map(dir => {
                const jsonPath = path.join(this.versionsDir, dir, `${dir}.json`)
                const json = fs.readJsonSync(jsonPath)
                return {
                    id: dir,
                    type: json.type || 'release',
                    releaseTime: json.releaseTime,
                    hasJar: fs.existsSync(path.join(this.versionsDir, dir, `${dir}.jar`))
                }
            })
    }

    /**
     * Delete a version
     */
    deleteVersion(versionId) {
        const versionDir = path.join(this.versionsDir, versionId)
        if (fs.existsSync(versionDir)) {
            fs.removeSync(versionDir)
            return true
        }
        return false
    }
}

module.exports = VersionManager
