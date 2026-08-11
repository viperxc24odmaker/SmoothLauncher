/**
 * JavaManager
 * 
 * Detects and manages Java installations
 * Downloads Java if not found (Adoptium/Temurin)
 * 
 * @module javamanager
 */

const { exec } = require('child_process')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('JavaManager')

// Adoptium API for Java downloads
const ADOPTIUM_API = 'https://api.adoptium.net/v3'

class JavaManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.javaDir = path.join(dataPath, 'java')
        fs.ensureDirSync(this.javaDir)
    }

    /**
     * Find Java installation on system
     */
    async findJava() {
        const candidates = []

        // Check JAVA_HOME
        if (process.env.JAVA_HOME) {
            const javaHome = process.env.JAVA_HOME
            const javaBin = this.getJavaBinary(javaHome)
            if (fs.existsSync(javaBin)) {
                candidates.push(javaBin)
            }
        }

        // Check PATH
        try {
            const pathJava = await this.executeCommand(
                process.platform === 'win32' ? 'where java' : 'which java'
            )
            if (pathJava.trim()) {
                candidates.push(pathJava.trim().split('\n')[0])
            }
        } catch (err) {
            // Not in PATH
        }

        // Check common locations
        const commonPaths = this.getCommonJavaPaths()
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                candidates.push(p)
            }
        }

        // Check our own downloaded Java
        const localJava = this.getLocalJavaPath()
        if (localJava && fs.existsSync(localJava)) {
            candidates.push(localJava)
        }

        // Validate each candidate
        for (const candidate of candidates) {
            const version = await this.getJavaVersion(candidate)
            if (version) {
                return {
                    path: candidate,
                    version: version.version,
                    major: version.major
                }
            }
        }

        return null
    }

    /**
     * Get Java binary path from JAVA_HOME
     */
    getJavaBinary(javaHome) {
        if (process.platform === 'win32') {
            return path.join(javaHome, 'bin', 'java.exe')
        }
        return path.join(javaHome, 'bin', 'java')
    }

    /**
     * Get common Java installation paths
     */
    getCommonJavaPaths() {
        const paths = []

        if (process.platform === 'win32') {
            const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
            const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

            // Check Program Files for Java installations
            for (const base of [programFiles, programFilesX86]) {
                for (const vendor of ['Java', 'Eclipse Adoptium', 'Temurin', 'Zulu', 'AdoptOpenJDK']) {
                    const vendorDir = path.join(base, vendor)
                    if (fs.existsSync(vendorDir)) {
                        try {
                            const dirs = fs.readdirSync(vendorDir)
                            for (const dir of dirs) {
                                const javaBin = path.join(vendorDir, dir, 'bin', 'java.exe')
                                if (fs.existsSync(javaBin)) {
                                    paths.push(javaBin)
                                }
                            }
                        } catch (err) {
                            // Permission denied or doesn't exist
                        }
                    }
                }
            }
        } else if (process.platform === 'darwin') {
            paths.push('/usr/bin/java')
            paths.push('/Library/Java/JavaVirtualMachines')

            try {
                const jvmDir = '/Library/Java/JavaVirtualMachines'
                if (fs.existsSync(jvmDir)) {
                    const dirs = fs.readdirSync(jvmDir)
                    for (const dir of dirs) {
                        paths.push(path.join(jvmDir, dir, 'Contents', 'Home', 'bin', 'java'))
                    }
                }
            } catch (err) {
                // Ignore
            }
        } else {
            // Linux
            paths.push('/usr/bin/java')
            paths.push('/usr/lib/jvm')

            try {
                const jvmDir = '/usr/lib/jvm'
                if (fs.existsSync(jvmDir)) {
                    const dirs = fs.readdirSync(jvmDir)
                    for (const dir of dirs) {
                        paths.push(path.join(jvmDir, dir, 'bin', 'java'))
                    }
                }
            } catch (err) {
                // Ignore
            }
        }

        return paths
    }

    /**
     * Get local downloaded Java path
     */
    getLocalJavaPath() {
        if (!fs.existsSync(this.javaDir)) return null

        const dirs = fs.readdirSync(this.javaDir)
        if (dirs.length === 0) return null

        // Find the latest Java directory
        const latestDir = dirs.sort().reverse()[0]
        const javaHome = path.join(this.javaDir, latestDir)

        return this.getJavaBinary(javaHome)
    }

    /**
     * Get Java version from binary
     */
    async getJavaVersion(javaPath) {
        try {
            const output = await this.executeCommand(`"${javaPath}" -version`)
            const versionMatch = output.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/)

            if (versionMatch) {
                const major = parseInt(versionMatch[1])
                const version = versionMatch[0].replace('version ', '').replace(/"/g, '')
                return { version, major }
            }
        } catch (err) {
            // Not a valid Java binary
        }
        return null
    }

    /**
     * Check if Java meets minimum version requirement
     */
    async validateJava(javaPath, minMajor = 17) {
        const version = await this.getJavaVersion(javaPath)
        if (!version) return false
        return version.major >= minMajor
    }

    /**
     * Get required Java version for MC version
     */
    getRequiredJavaVersion(mcVersion) {
        // Parse MC version
        const parts = mcVersion.split('.')
        const minor = parseInt(parts[1]) || 0
        const patch = parseInt(parts[2]) || 0

        // MC 1.21+ requires Java 21
        if (minor >= 21) return 21
        // MC 1.18+ requires Java 17
        if (minor >= 18) return 17
        // MC 1.17 requires Java 16
        if (minor === 17) return 16
        // MC 1.12-1.16 works with Java 8
        return 8
    }

    /**
     * Download Java from Adoptium
     */
    async downloadJava(majorVersion = 21, onProgress) {
        log.info(`Downloading Java ${majorVersion} from Adoptium...`)

        const os = this.getAdoptiumOS()
        const arch = this.getAdoptiumArch()
        const imageType = 'jdk'

        const url = `${ADOPTIUM_API}/assets/latest/${majorVersion}/hotspot?os=${os}&architecture=${arch}&image_type=${imageType}`

        try {
            const response = await got(url, { responseType: 'json' })
            const assets = response.body

            if (!assets || assets.length === 0) {
                throw new Error(`No Java ${majorVersion} builds found for ${os} ${arch}`)
            }

            const asset = assets[0]
            const binary = asset.binary
            const downloadUrl = binary.package.link
            const fileName = binary.package.name
            const fileSize = binary.package.size

            log.info(`Downloading ${fileName} (${this.formatSize(fileSize)})`)

            const downloadPath = path.join(this.javaDir, fileName)

            const writeStream = fs.createWriteStream(downloadPath)
            const downloadStream = got.stream(downloadUrl)

            downloadStream.on('downloadProgress', (progress) => {
                if (onProgress) {
                    onProgress({
                        downloaded: progress.transferred,
                        total: fileSize,
                        percent: Math.round((progress.transferred / fileSize) * 100)
                    })
                }
            })

            await new Promise((resolve, reject) => {
                downloadStream.pipe(writeStream)
                writeStream.on('finish', resolve)
                writeStream.on('error', reject)
                downloadStream.on('error', reject)
            })

            // Extract
            log.info('Extracting Java...')
            await this.extractJava(downloadPath)

            // Clean up archive
            fs.removeSync(downloadPath)

            // Find the extracted Java binary
            const localJava = this.getLocalJavaPath()
            if (localJava) {
                log.info(`Java ${majorVersion} installed: ${localJava}`)
                return {
                    success: true,
                    path: localJava,
                    version: majorVersion
                }
            }

            throw new Error('Java extraction failed - binary not found')
        } catch (err) {
            log.error(`Failed to download Java: ${err.message}`)
            throw err
        }
    }

    /**
     * Extract Java archive
     */
    async extractJava(archivePath) {
        const ext = path.extname(archivePath).toLowerCase()

        if (ext === '.zip') {
            const AdmZip = require('adm-zip')
            const zip = new AdmZip(archivePath)
            zip.extractAllTo(this.javaDir, true)
        } else if (ext === '.gz' || archivePath.endsWith('.tar.gz')) {
            await this.executeCommand(`tar -xzf "${archivePath}" -C "${this.javaDir}"`)
        } else {
            throw new Error(`Unsupported archive format: ${ext}`)
        }
    }

    /**
     * Get Adoptium OS string
     */
    getAdoptiumOS() {
        switch (process.platform) {
            case 'win32': return 'windows'
            case 'darwin': return 'mac'
            case 'linux': return 'linux'
            default: return 'linux'
        }
    }

    /**
     * Get Adoptium architecture string
     */
    getAdoptiumArch() {
        switch (process.arch) {
            case 'x64': return 'x64'
            case 'arm64': return 'aarch64'
            case 'ia32': return 'x86'
            default: return 'x64'
        }
    }

    /**
     * Execute command and return output
     */
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error && !stderr) {
                    reject(error)
                    return
                }
                resolve(stdout || stderr)
            })
        })
    }

    /**
     * Format size
     */
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }
}

module.exports = JavaManager
