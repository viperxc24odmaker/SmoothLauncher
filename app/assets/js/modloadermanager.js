/**
 * ModLoaderManager
 * 
 * Installs and manages mod loaders: Fabric, Forge, NeoForge
 * Downloads loader profiles and merges with vanilla version JSON
 * 
 * @module modloadermanager
 */

const got = require('got')
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('ModLoaderManager')

// API endpoints
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const FORGE_MAVEN = 'https://files.minecraftforge.net/maven'
const FORGE_PROMOTIONS = 'https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases'

class ModLoaderManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.versionsDir = path.join(dataPath, 'versions')
        this.librariesDir = path.join(dataPath, 'libraries')
        fs.ensureDirSync(this.versionsDir)
        fs.ensureDirSync(this.librariesDir)
    }

    // ========================================
    // FABRIC
    // ========================================

    /**
     * Get available Fabric loader versions
     */
    async getFabricLoaderVersions() {
        try {
            const response = await got(`${FABRIC_META}/versions/loader`, { responseType: 'json' })
            return response.body
        } catch (err) {
            log.error('Failed to fetch Fabric loader versions:', err)
            throw err
        }
    }

    /**
     * Get Fabric game versions
     */
    async getFabricGameVersions() {
        try {
            const response = await got(`${FABRIC_META}/versions/game`, { responseType: 'json' })
            return response.body
        } catch (err) {
            log.error('Failed to fetch Fabric game versions:', err)
            throw err
        }
    }

    /**
     * Get Fabric installer versions
     */
    async getFabricInstallerVersions() {
        try {
            const response = await got(`${FABRIC_META}/versions/installer`, { responseType: 'json' })
            return response.body
        } catch (err) {
            log.error('Failed to fetch Fabric installer versions:', err)
            throw err
        }
    }

    /**
     * Install Fabric for a specific game version
     */
    async installFabric(gameVersion, loaderVersion = null) {
        log.info(`Installing Fabric for ${gameVersion}...`)

        // Get latest loader version if not specified
        if (!loaderVersion) {
            const loaders = await this.getFabricLoaderVersions()
            const stable = loaders.find(l => l.stable)
            loaderVersion = stable ? stable.version : loaders[0].version
        }

        // Get profile JSON from Fabric meta
        const profileUrl = `${FABRIC_META}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`
        
        try {
            const response = await got(profileUrl, { responseType: 'json' })
            const profile = response.body

            // Create version directory
            const versionId = `fabric-loader-${loaderVersion}-${gameVersion}`
            const versionDir = path.join(this.versionsDir, versionId)
            fs.ensureDirSync(versionDir)

            // Save version JSON
            const jsonPath = path.join(versionDir, `${versionId}.json`)
            fs.writeJsonSync(jsonPath, profile, { spaces: 2 })

            // Download Fabric libraries
            await this.downloadFabricLibraries(profile)

            log.info(`Fabric ${loaderVersion} installed for ${gameVersion}`)
            return {
                success: true,
                versionId,
                loaderVersion,
                gameVersion
            }
        } catch (err) {
            log.error(`Failed to install Fabric: ${err.message}`)
            throw err
        }
    }

    /**
     * Download Fabric libraries
     */
    async downloadFabricLibraries(profile) {
        const libraries = profile.libraries || []
        let downloaded = 0

        for (const lib of libraries) {
            const name = lib.name
            const url = lib.url || 'https://maven.fabricmc.net/'

            // Parse maven coordinates: group:artifact:version
            const parts = name.split(':')
            if (parts.length < 3) continue

            const [group, artifact, version] = parts
            const groupPath = group.replace(/\./g, '/')
            const fileName = `${artifact}-${version}.jar`
            const mavenPath = `${groupPath}/${artifact}/${version}/${fileName}`

            const libPath = path.join(this.librariesDir, mavenPath)
            if (fs.existsSync(libPath)) {
                downloaded++
                continue
            }

            fs.ensureDirSync(path.dirname(libPath))

            const downloadUrl = `${url}${mavenPath}`
            try {
                const response = await got(downloadUrl, { responseType: 'buffer' })
                fs.writeFileSync(libPath, response.body)
                downloaded++
                log.info(`Downloaded: ${artifact}-${version}`)
            } catch (err) {
                log.warn(`Failed to download ${name}: ${err.message}`)
            }
        }

        log.info(`Downloaded ${downloaded}/${libraries.length} Fabric libraries`)
    }

    // ========================================
    // FORGE
    // ========================================

    /**
     * Get Forge promotions (recommended/latest versions per MC version)
     */
    async getForgePromotions() {
        try {
            const response = await got(FORGE_PROMOTIONS, { responseType: 'json' })
            return response.body.promos
        } catch (err) {
            log.error('Failed to fetch Forge promotions:', err)
            throw err
        }
    }

    /**
     * Get recommended Forge version for a game version
     */
    async getForgeRecommended(gameVersion) {
        const promos = await this.getForgePromotions()
        return promos[`${gameVersion}-recommended`] || promos[`${gameVersion}-latest`] || null
    }

    /**
     * Get available Forge versions for a game version
     */
    async getForgeVersions(gameVersion) {
        try {
            const url = `https://files.minecraftforge.net/net/minecraftforge/forge/index_${gameVersion}.html`
            const promos = await this.getForgePromotions()

            const versions = []
            for (const [key, value] of Object.entries(promos)) {
                if (key.startsWith(gameVersion)) {
                    const type = key.replace(`${gameVersion}-`, '')
                    versions.push({
                        version: value,
                        type: type,
                        gameVersion: gameVersion
                    })
                }
            }

            return versions
        } catch (err) {
            log.error('Failed to fetch Forge versions:', err)
            throw err
        }
    }

    /**
     * Install Forge for a specific game version
     */
    async installForge(gameVersion, forgeVersion = null) {
        log.info(`Installing Forge for ${gameVersion}...`)

        if (!forgeVersion) {
            forgeVersion = await this.getForgeRecommended(gameVersion)
            if (!forgeVersion) {
                throw new Error(`No Forge version found for ${gameVersion}`)
            }
        }

        const fullVersion = `${gameVersion}-${forgeVersion}`
        const installerUrl = `${FORGE_MAVEN}/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`

        const versionId = `forge-${fullVersion}`
        const versionDir = path.join(this.versionsDir, versionId)
        fs.ensureDirSync(versionDir)

        // Download installer jar
        const installerPath = path.join(versionDir, `forge-${fullVersion}-installer.jar`)

        try {
            log.info(`Downloading Forge installer: ${fullVersion}`)
            const response = await got(installerUrl, { responseType: 'buffer' })
            fs.writeFileSync(installerPath, response.body)

            // Extract version JSON from installer jar
            const AdmZip = require('adm-zip')
            const zip = new AdmZip(installerPath)

            // Try to find install_profile.json or version.json
            let versionJson = null

            const installProfile = zip.getEntry('install_profile.json')
            if (installProfile) {
                const profileData = JSON.parse(installProfile.getData().toString())

                // Modern Forge (1.13+) has version info in install_profile
                if (profileData.versionInfo) {
                    versionJson = profileData.versionInfo
                } else if (profileData.version) {
                    // Try to get version JSON from the jar
                    const versionEntry = zip.getEntry(`version.json`)
                    if (versionEntry) {
                        versionJson = JSON.parse(versionEntry.getData().toString())
                    }
                }
            }

            // Fallback: check for version.json directly
            if (!versionJson) {
                const versionEntry = zip.getEntry('version.json')
                if (versionEntry) {
                    versionJson = JSON.parse(versionEntry.getData().toString())
                }
            }

            if (versionJson) {
                const jsonPath = path.join(versionDir, `${versionId}.json`)
                fs.writeJsonSync(jsonPath, versionJson, { spaces: 2 })

                // Download Forge libraries
                if (versionJson.libraries) {
                    await this.downloadForgeLibraries(versionJson.libraries)
                }
            }

            // Extract Forge universal/client jar if present
            const universalEntry = zip.getEntry(`maven/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}.jar`) ||
                                   zip.getEntry(`maven/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-universal.jar`)

            if (universalEntry) {
                const forgeLibDir = path.join(this.librariesDir, 'net', 'minecraftforge', 'forge', fullVersion)
                fs.ensureDirSync(forgeLibDir)
                zip.extractEntryTo(universalEntry, forgeLibDir, false, true)
            }

            log.info(`Forge ${fullVersion} installed`)
            return {
                success: true,
                versionId,
                forgeVersion,
                gameVersion
            }
        } catch (err) {
            log.error(`Failed to install Forge: ${err.message}`)
            throw err
        }
    }

    /**
     * Download Forge libraries
     */
    async downloadForgeLibraries(libraries) {
        let downloaded = 0

        for (const lib of libraries) {
            if (lib.downloads?.artifact) {
                const artifact = lib.downloads.artifact
                const libPath = path.join(this.librariesDir, artifact.path)

                if (fs.existsSync(libPath)) {
                    downloaded++
                    continue
                }

                fs.ensureDirSync(path.dirname(libPath))

                try {
                    const response = await got(artifact.url, { responseType: 'buffer' })
                    fs.writeFileSync(libPath, response.body)
                    downloaded++
                } catch (err) {
                    log.warn(`Failed to download Forge lib: ${lib.name}`)
                }
            } else if (lib.name) {
                // Parse maven coordinates
                const parts = lib.name.split(':')
                if (parts.length < 3) continue

                const [group, artifact, version] = parts
                const groupPath = group.replace(/\./g, '/')
                const fileName = `${artifact}-${version}.jar`
                const mavenPath = `${groupPath}/${artifact}/${version}/${fileName}`

                const libPath = path.join(this.librariesDir, mavenPath)
                if (fs.existsSync(libPath)) {
                    downloaded++
                    continue
                }

                fs.ensureDirSync(path.dirname(libPath))

                // Try multiple Maven repos
                const repos = [
                    lib.url || '',
                    'https://libraries.minecraft.net/',
                    `${FORGE_MAVEN}/`,
                    'https://repo.maven.apache.org/maven2/'
                ].filter(r => r)

                for (const repo of repos) {
                    try {
                        const response = await got(`${repo}${mavenPath}`, { responseType: 'buffer' })
                        fs.writeFileSync(libPath, response.body)
                        downloaded++
                        break
                    } catch (err) {
                        // Try next repo
                    }
                }
            }
        }

        log.info(`Downloaded ${downloaded} Forge libraries`)
    }

    // ========================================
    // NEOFORGE
    // ========================================

    /**
     * Get available NeoForge versions
     */
    async getNeoForgeVersions() {
        try {
            const url = `${NEOFORGE_MAVEN}/net/neoforged/neoforge/maven-metadata.xml`
            const response = await got(url)
            const xml = response.body

            // Parse versions from XML
            const versionRegex = /<version>([^<]+)<\/version>/g
            const versions = []
            let match

            while ((match = versionRegex.exec(xml)) !== null) {
                versions.push(match[1])
            }

            return versions.reverse() // Newest first
        } catch (err) {
            log.error('Failed to fetch NeoForge versions:', err)
            throw err
        }
    }

    /**
     * Get NeoForge versions for a specific MC version
     */
    async getNeoForgeVersionsForMC(gameVersion) {
        const allVersions = await this.getNeoForgeVersions()

        // NeoForge uses MC version as prefix (e.g. 21.1.x for MC 1.21.1)
        // For 1.21.x: versions start with 21.x
        const mcParts = gameVersion.split('.')
        let prefix = ''

        if (mcParts.length >= 2) {
            // 1.21.1 -> 21.1, 1.20.4 -> 20.4
            prefix = mcParts.slice(1).join('.')
        }

        return allVersions.filter(v => v.startsWith(prefix))
    }

    /**
     * Install NeoForge
     */
    async installNeoForge(gameVersion, neoforgeVersion = null) {
        log.info(`Installing NeoForge for ${gameVersion}...`)

        if (!neoforgeVersion) {
            const versions = await this.getNeoForgeVersionsForMC(gameVersion)
            if (versions.length === 0) {
                throw new Error(`No NeoForge versions found for ${gameVersion}`)
            }
            neoforgeVersion = versions[0] // Latest
        }

        const installerUrl = `${NEOFORGE_MAVEN}/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`

        const versionId = `neoforge-${neoforgeVersion}`
        const versionDir = path.join(this.versionsDir, versionId)
        fs.ensureDirSync(versionDir)

        const installerPath = path.join(versionDir, `neoforge-${neoforgeVersion}-installer.jar`)

        try {
            log.info(`Downloading NeoForge installer: ${neoforgeVersion}`)
            const response = await got(installerUrl, { responseType: 'buffer' })
            fs.writeFileSync(installerPath, response.body)

            // Extract version JSON from installer
            const AdmZip = require('adm-zip')
            const zip = new AdmZip(installerPath)

            let versionJson = null

            const versionEntry = zip.getEntry('version.json')
            if (versionEntry) {
                versionJson = JSON.parse(versionEntry.getData().toString())
            }

            if (versionJson) {
                const jsonPath = path.join(versionDir, `${versionId}.json`)
                fs.writeJsonSync(jsonPath, versionJson, { spaces: 2 })

                if (versionJson.libraries) {
                    await this.downloadNeoForgeLibraries(versionJson.libraries)
                }
            }

            log.info(`NeoForge ${neoforgeVersion} installed`)
            return {
                success: true,
                versionId,
                neoforgeVersion,
                gameVersion
            }
        } catch (err) {
            log.error(`Failed to install NeoForge: ${err.message}`)
            throw err
        }
    }

    /**
     * Download NeoForge libraries
     */
    async downloadNeoForgeLibraries(libraries) {
        let downloaded = 0

        for (const lib of libraries) {
            if (lib.downloads?.artifact) {
                const artifact = lib.downloads.artifact
                const libPath = path.join(this.librariesDir, artifact.path)

                if (fs.existsSync(libPath)) {
                    downloaded++
                    continue
                }

                fs.ensureDirSync(path.dirname(libPath))

                try {
                    const response = await got(artifact.url, { responseType: 'buffer' })
                    fs.writeFileSync(libPath, response.body)
                    downloaded++
                } catch (err) {
                    log.warn(`Failed to download NeoForge lib: ${lib.name}`)
                }
            }
        }

        log.info(`Downloaded ${downloaded} NeoForge libraries`)
    }

    // ========================================
    // UTILITY
    // ========================================

    /**
     * Get installed mod loaders
     */
    getInstalledLoaders() {
        if (!fs.existsSync(this.versionsDir)) return []

        return fs.readdirSync(this.versionsDir)
            .filter(dir => {
                return dir.startsWith('fabric-') || 
                       dir.startsWith('forge-') || 
                       dir.startsWith('neoforge-')
            })
            .map(dir => {
                let type = 'unknown'
                if (dir.startsWith('fabric-')) type = 'fabric'
                else if (dir.startsWith('forge-')) type = 'forge'
                else if (dir.startsWith('neoforge-')) type = 'neoforge'

                return {
                    id: dir,
                    type: type,
                    path: path.join(this.versionsDir, dir)
                }
            })
    }

    /**
     * Uninstall a mod loader version
     */
    uninstallLoader(versionId) {
        const versionDir = path.join(this.versionsDir, versionId)
        if (fs.existsSync(versionDir)) {
            fs.removeSync(versionDir)
            log.info(`Uninstalled ${versionId}`)
            return true
        }
        return false
    }
}

module.exports = ModLoaderManager
