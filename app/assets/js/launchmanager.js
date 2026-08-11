/**
 * LaunchManager
 * 
 * The core engine that launches Minecraft
 * Builds classpath, JVM args, game args, and starts the process
 * 
 * @module launchmanager
 */

const { spawn } = require('child_process')
const fs = require('fs-extra')
const path = require('path')
const AdmZip = require('adm-zip')
const { LoggerUtil } = require('helios-core')

const VersionManager = require('./versionmanager')
const JavaManager = require('./javamanager')
const InstanceManager = require('./instancemanager')

const log = LoggerUtil.getLogger('LaunchManager')

class LaunchManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.versionManager = new VersionManager(dataPath)
        this.javaManager = new JavaManager(dataPath)
        this.instanceManager = new InstanceManager(dataPath)
        this.activeProcesses = new Map()
    }

    /**
     * Full launch flow - download everything needed and start the game
     */
    async launch(instanceId, account, onProgress) {
        const instance = this.instanceManager.getInstance(instanceId)
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`)
        }

        const progress = (stage, data) => {
            if (onProgress) onProgress({ stage, ...data })
        }

        try {
            // Step 1: Find or download Java
            progress('java', { message: 'Checking Java...' })
            const javaPath = await this.ensureJava(instance)

            // Step 2: Download version JSON
            progress('version', { message: `Downloading ${instance.mcVersion} info...` })
            const versionJson = await this.versionManager.downloadVersionJson(
                instance.versionId || instance.mcVersion
            )

            // Step 3: Download client jar
            progress('client', { message: 'Downloading Minecraft...' })
            const clientJar = await this.versionManager.downloadClientJar(
                instance.mcVersion,
                (p) => progress('client', { message: `Downloading Minecraft... ${p.percent}%`, ...p })
            )

            // Step 4: Download libraries
            progress('libraries', { message: 'Downloading libraries...' })
            const libraryPaths = await this.versionManager.downloadLibraries(
                instance.mcVersion,
                (p) => progress('libraries', { message: `Downloading libraries... ${p.percent}%`, ...p })
            )

            // Step 5: Download assets
            progress('assets', { message: 'Downloading assets...' })
            await this.versionManager.downloadAssets(
                instance.mcVersion,
                (p) => progress('assets', { message: `Downloading assets... ${p.percent}%`, ...p })
            )

            // Step 6: Handle mod loader
            if (instance.modLoader !== 'vanilla' && instance.versionId !== instance.mcVersion) {
                progress('modloader', { message: `Setting up ${instance.modLoader}...` })
                const loaderJson = await this.getModLoaderJson(instance)
                if (loaderJson && loaderJson.libraries) {
                    // Add mod loader libraries to classpath
                    for (const lib of loaderJson.libraries) {
                        if (lib.downloads?.artifact) {
                            const libPath = path.join(this.dataPath, 'libraries', lib.downloads.artifact.path)
                            if (fs.existsSync(libPath)) {
                                libraryPaths.push(libPath)
                            }
                        } else if (lib.name) {
                            const libPath = this.mavenToPath(lib.name)
                            if (fs.existsSync(libPath)) {
                                libraryPaths.push(libPath)
                            }
                        }
                    }
                }
            }

            // Step 7: Extract natives
            progress('natives', { message: 'Extracting natives...' })
            const nativesDir = await this.extractNatives(instance, versionJson)

            // Step 8: Build launch arguments
            progress('launch', { message: 'Preparing launch...' })
            const launchArgs = this.buildLaunchArgs({
                instance,
                versionJson,
                account,
                javaPath,
                clientJar,
                libraryPaths,
                nativesDir
            })

            // Step 9: Launch!
            progress('launch', { message: 'Launching Minecraft!' })
            const gameProcess = await this.startProcess(instance, javaPath, launchArgs)

            // Record the play
            this.instanceManager.recordPlay(instanceId)

            return {
                success: true,
                pid: gameProcess.pid,
                instanceId
            }
        } catch (err) {
            log.error(`Launch failed: ${err.message}`)
            progress('error', { message: `Launch failed: ${err.message}` })
            throw err
        }
    }

    /**
     * Ensure Java is available
     */
    async ensureJava(instance) {
        // Check if instance has custom Java path
        if (instance.javaPath && fs.existsSync(instance.javaPath)) {
            return instance.javaPath
        }

        // Find system Java
        const java = await this.javaManager.findJava()
        if (java) {
            const requiredVersion = this.javaManager.getRequiredJavaVersion(instance.mcVersion)
            if (java.major >= requiredVersion) {
                return java.path
            }
        }

        // Download Java
        const requiredVersion = this.javaManager.getRequiredJavaVersion(instance.mcVersion)
        log.info(`Downloading Java ${requiredVersion}...`)
        const result = await this.javaManager.downloadJava(requiredVersion)
        return result.path
    }

    /**
     * Get mod loader version JSON
     */
    async getModLoaderJson(instance) {
        const versionDir = path.join(this.dataPath, 'versions', instance.versionId)
        const jsonPath = path.join(versionDir, `${instance.versionId}.json`)

        if (fs.existsSync(jsonPath)) {
            return fs.readJsonSync(jsonPath)
        }

        return null
    }

    /**
     * Extract native libraries
     */
    async extractNatives(instance, versionJson) {
        const nativesDir = path.join(this.dataPath, 'natives', instance.mcVersion)
        fs.ensureDirSync(nativesDir)

        const platform = this.versionManager.getCurrentPlatform()

        for (const lib of versionJson.libraries) {
            if (!lib.natives) continue
            if (!this.versionManager.checkLibraryRules(lib)) continue

            const nativeKey = lib.natives[platform]
            if (!nativeKey) continue

            const classifier = lib.downloads?.classifiers?.[nativeKey]
            if (!classifier) continue

            const nativePath = path.join(this.dataPath, 'libraries', classifier.path)
            if (!fs.existsSync(nativePath)) continue

            try {
                const zip = new AdmZip(nativePath)
                const entries = zip.getEntries()

                for (const entry of entries) {
                    // Skip META-INF
                    if (entry.entryName.startsWith('META-INF/')) continue

                    const destPath = path.join(nativesDir, entry.entryName)
                    if (entry.isDirectory) {
                        fs.ensureDirSync(destPath)
                    } else {
                        fs.ensureDirSync(path.dirname(destPath))
                        fs.writeFileSync(destPath, entry.getData())
                    }
                }
            } catch (err) {
                log.warn(`Failed to extract native ${nativePath}: ${err.message}`)
            }
        }

        return nativesDir
    }

    /**
     * Build launch arguments
     */
    buildLaunchArgs(options) {
        const { instance, versionJson, account, clientJar, libraryPaths, nativesDir } = options

        const args = []

        // JVM arguments
        args.push(`-Xmx${instance.maxMemory || 2048}M`)
        args.push(`-Xms${instance.minMemory || 512}M`)
        args.push(`-Djava.library.path=${nativesDir}`)
        args.push('-XX:+UnlockExperimentalVMOptions')
        args.push('-XX:+UseG1GC')
        args.push('-XX:G1NewSizePercent=20')
        args.push('-XX:G1ReservePercent=20')
        args.push('-XX:MaxGCPauseMillis=50')
        args.push('-XX:G1HeapRegionSize=32M')

        // Classpath
        const separator = process.platform === 'win32' ? ';' : ':'
        const classpath = [...libraryPaths, clientJar].join(separator)
        args.push('-cp')
        args.push(classpath)

        // Main class
        let mainClass = versionJson.mainClass

        // Check if mod loader overrides main class
        if (instance.modLoader !== 'vanilla') {
            const loaderJson = this.getModLoaderJsonSync(instance)
            if (loaderJson && loaderJson.mainClass) {
                mainClass = loaderJson.mainClass
            }
        }

        args.push(mainClass)

        // Game arguments
        const gameArgs = this.buildGameArgs(instance, versionJson, account)
        args.push(...gameArgs)

        return args
    }

    /**
     * Build game arguments
     */
    buildGameArgs(instance, versionJson, account) {
        const args = []
        const gameDir = instance.gameDir
        const assetsDir = path.join(this.dataPath, 'assets')

        // New format (1.13+)
        if (versionJson.arguments && versionJson.arguments.game) {
            for (const arg of versionJson.arguments.game) {
                if (typeof arg === 'string') {
                    args.push(this.replaceArgPlaceholders(arg, {
                        instance, versionJson, account, gameDir, assetsDir
                    }))
                }
                // Skip complex rule-based args for now
            }
        }
        // Legacy format (pre-1.13)
        else if (versionJson.minecraftArguments) {
            const legacyArgs = versionJson.minecraftArguments.split(' ')
            for (const arg of legacyArgs) {
                args.push(this.replaceArgPlaceholders(arg, {
                    instance, versionJson, account, gameDir, assetsDir
                }))
            }
        }

        // Resolution
        if (instance.resolution) {
            args.push('--width', String(instance.resolution.width))
            args.push('--height', String(instance.resolution.height))
        }

        return args
    }

    /**
     * Replace argument placeholders
     */
    replaceArgPlaceholders(arg, context) {
        const { instance, versionJson, account, gameDir, assetsDir } = context

        return arg
            .replace('${auth_player_name}', account.username || 'Player')
            .replace('${version_name}', instance.mcVersion)
            .replace('${game_directory}', gameDir)
            .replace('${assets_root}', assetsDir)
            .replace('${assets_index_name}', versionJson.assetIndex?.id || versionJson.assets || instance.mcVersion)
            .replace('${auth_uuid}', (account.uuid || 'ffffffff-ffff-ffff-ffff-ffffffffffff').replace(/-/g, ''))
            .replace('${auth_access_token}', account.accessToken || '0')
            .replace('${clientid}', account.clientToken || '0')
            .replace('${auth_xuid}', account.xuid || '0')
            .replace('${user_type}', account.offlineMode ? 'legacy' : 'msa')
            .replace('${version_type}', versionJson.type || 'release')
            .replace('${user_properties}', '{}')
            .replace('${resolution_width}', String(instance.resolution?.width || 1280))
            .replace('${resolution_height}', String(instance.resolution?.height || 720))
    }

    /**
     * Get mod loader JSON (sync version)
     */
    getModLoaderJsonSync(instance) {
        try {
            const versionDir = path.join(this.dataPath, 'versions', instance.versionId)
            const jsonPath = path.join(versionDir, `${instance.versionId}.json`)
            if (fs.existsSync(jsonPath)) {
                return fs.readJsonSync(jsonPath)
            }
        } catch (err) {
            // Ignore
        }
        return null
    }

    /**
     * Start the game process
     */
    async startProcess(instance, javaPath, args) {
        log.info(`Launching: ${javaPath}`)
        log.info(`Args: ${args.join(' ').substring(0, 200)}...`)

        const gameProcess = spawn(javaPath, args, {
            cwd: instance.gameDir,
            detached: true,
            env: {
                ...process.env
            }
        })

        this.activeProcesses.set(instance.id, gameProcess)

        gameProcess.stdout.on('data', (data) => {
            log.info(`[${instance.name}] ${data.toString().trim()}`)
        })

        gameProcess.stderr.on('data', (data) => {
            log.warn(`[${instance.name}] ${data.toString().trim()}`)
        })

        gameProcess.on('close', (code) => {
            log.info(`[${instance.name}] Process exited with code ${code}`)
            this.activeProcesses.delete(instance.id)
        })

        gameProcess.on('error', (err) => {
            log.error(`[${instance.name}] Process error: ${err.message}`)
            this.activeProcesses.delete(instance.id)
        })

        return gameProcess
    }

    /**
     * Kill running instance
     */
    killInstance(instanceId) {
        const proc = this.activeProcesses.get(instanceId)
        if (proc) {
            proc.kill()
            this.activeProcesses.delete(instanceId)
            return true
        }
        return false
    }

    /**
     * Check if instance is running
     */
    isRunning(instanceId) {
        return this.activeProcesses.has(instanceId)
    }

    /**
     * Get all running instances
     */
    getRunningInstances() {
        return Array.from(this.activeProcesses.keys())
    }

    /**
     * Convert maven coordinate to library path
     */
    mavenToPath(mavenCoord) {
        const parts = mavenCoord.split(':')
        if (parts.length < 3) return ''

        const [group, artifact, version] = parts
        const groupPath = group.replace(/\./g, '/')
        const fileName = `${artifact}-${version}.jar`

        return path.join(this.dataPath, 'libraries', groupPath, artifact, version, fileName)
    }
}

module.exports = LaunchManager
