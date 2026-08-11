/**
 * ModSearchManager
 * 
 * Modrinth API integration for searching, browsing, and downloading mods
 * Supports all Modrinth filters: game version, loader, category, environment, license
 * 
 * API Docs: https://docs.modrinth.com/api
 * 
 * @module modsearchmanager
 */

const got = require('got')
const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const log = LoggerUtil.getLogger('ModSearchManager')

const MODRINTH_API = 'https://api.modrinth.com/v2'
const USER_AGENT = 'MakeForge-Launcher/1.0.0 (https://github.com/viperxc24odmaker/SmoothLauncher)'

class ModSearchManager {
    constructor(dataPath) {
        this.dataPath = dataPath
        this.cacheDir = path.join(dataPath, 'cache', 'modrinth')
        fs.ensureDirSync(this.cacheDir)
    }

    // ========================================
    // SEARCH
    // ========================================

    /**
     * Search for mods on Modrinth
     * 
     * @param {Object} options Search options
     * @param {string} options.query - Search query text
     * @param {string[]} options.categories - Category filters (e.g. ['optimization', 'utility'])
     * @param {string[]} options.loaders - Loader filters (e.g. ['fabric', 'forge', 'neoforge'])
     * @param {string[]} options.versions - Game version filters (e.g. ['1.21.11', '1.21.1'])
     * @param {string} options.environment - Environment filter ('client' or 'server')
     * @param {string} options.license - License filter ('open-source')
     * @param {string} options.projectType - Project type ('mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin')
     * @param {string} options.sortBy - Sort order ('relevance', 'downloads', 'follows', 'newest', 'updated')
     * @param {number} options.limit - Results per page (default 20, max 100)
     * @param {number} options.offset - Pagination offset
     * @returns {Object} Search results with hits, total_hits, limit, offset
     */
    async search(options = {}) {
        const {
            query = '',
            categories = [],
            loaders = [],
            versions = [],
            environment = null,
            license = null,
            projectType = 'mod',
            sortBy = 'relevance',
            limit = 20,
            offset = 0
        } = options

        // Build facets array
        const facets = []

        // Project type facet
        if (projectType) {
            facets.push([`project_type:${projectType}`])
        }

        // Categories facet
        if (categories.length > 0) {
            facets.push(categories.map(c => `categories:${c}`))
        }

        // Loaders facet
        if (loaders.length > 0) {
            facets.push(loaders.map(l => `categories:${l}`))
        }

        // Versions facet
        if (versions.length > 0) {
            facets.push(versions.map(v => `versions:${v}`))
        }

        // Environment facet
        if (environment) {
            if (environment === 'client') {
                facets.push(['client_side:required', 'client_side:optional'])
            } else if (environment === 'server') {
                facets.push(['server_side:required', 'server_side:optional'])
            }
        }

        // License facet
        if (license === 'open-source') {
            facets.push(['open_source:true'])
        }

        // Build query params
        const params = new URLSearchParams()
        if (query) params.set('query', query)
        if (facets.length > 0) params.set('facets', JSON.stringify(facets))
        params.set('index', sortBy)
        params.set('limit', String(limit))
        params.set('offset', String(offset))

        try {
            const url = `${MODRINTH_API}/search?${params.toString()}`
            log.info(`Searching Modrinth: ${url}`)

            const response = await got(url, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            const data = response.body

            // Process results
            const results = {
                hits: data.hits.map(hit => ({
                    id: hit.project_id,
                    slug: hit.slug,
                    title: hit.title,
                    description: hit.description,
                    author: hit.author,
                    categories: hit.categories || [],
                    displayCategories: hit.display_categories || [],
                    versions: hit.versions || [],
                    downloads: hit.downloads,
                    follows: hit.follows,
                    iconUrl: hit.icon_url,
                    dateCreated: hit.date_created,
                    dateModified: hit.date_modified,
                    latestVersion: hit.latest_version,
                    license: hit.license,
                    clientSide: hit.client_side,
                    serverSide: hit.server_side,
                    gallery: hit.gallery || [],
                    featuredGallery: hit.featured_gallery,
                    color: hit.color
                })),
                totalHits: data.total_hits,
                limit: data.limit,
                offset: data.offset,
                totalPages: Math.ceil(data.total_hits / limit),
                currentPage: Math.floor(offset / limit) + 1
            }

            return results
        } catch (err) {
            log.error('Modrinth search failed:', err.message)
            throw err
        }
    }

    // ========================================
    // PROJECT DETAILS
    // ========================================

    /**
     * Get full project details
     */
    async getProject(idOrSlug) {
        try {
            const response = await got(`${MODRINTH_API}/project/${idOrSlug}`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body
        } catch (err) {
            log.error(`Failed to get project ${idOrSlug}:`, err.message)
            throw err
        }
    }

    /**
     * Get project versions (downloadable files)
     */
    async getProjectVersions(idOrSlug, options = {}) {
        const { loaders = [], gameVersions = [] } = options

        const params = new URLSearchParams()
        if (loaders.length > 0) params.set('loaders', JSON.stringify(loaders))
        if (gameVersions.length > 0) params.set('game_versions', JSON.stringify(gameVersions))

        try {
            const url = `${MODRINTH_API}/project/${idOrSlug}/version?${params.toString()}`
            const response = await got(url, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body.map(v => ({
                id: v.id,
                projectId: v.project_id,
                name: v.name,
                versionNumber: v.version_number,
                changelog: v.changelog,
                gameVersions: v.game_versions,
                loaders: v.loaders,
                featured: v.featured,
                status: v.status,
                versionType: v.version_type, // release, beta, alpha
                datePublished: v.date_published,
                downloads: v.downloads,
                dependencies: v.dependencies || [],
                files: v.files.map(f => ({
                    url: f.url,
                    filename: f.filename,
                    primary: f.primary,
                    size: f.size,
                    hashes: f.hashes
                }))
            }))
        } catch (err) {
            log.error(`Failed to get versions for ${idOrSlug}:`, err.message)
            throw err
        }
    }

    /**
     * Get multiple projects at once
     */
    async getProjects(ids) {
        try {
            const params = new URLSearchParams()
            params.set('ids', JSON.stringify(ids))

            const response = await got(`${MODRINTH_API}/projects?${params.toString()}`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body
        } catch (err) {
            log.error('Failed to get projects:', err.message)
            throw err
        }
    }

    // ========================================
    // DOWNLOAD
    // ========================================

    /**
     * Download a mod file to an instance's mods folder
     */
    async downloadMod(fileUrl, filename, instanceModsDir, onProgress) {
        fs.ensureDirSync(instanceModsDir)

        const destPath = path.join(instanceModsDir, filename)

        // Check if already exists
        if (fs.existsSync(destPath)) {
            log.info(`Mod already exists: ${filename}`)
            return { success: true, path: destPath, alreadyExists: true }
        }

        log.info(`Downloading mod: ${filename}`)

        const writeStream = fs.createWriteStream(destPath)
        const downloadStream = got.stream(fileUrl, {
            headers: { 'User-Agent': USER_AGENT }
        })

        downloadStream.on('downloadProgress', (progress) => {
            if (onProgress) {
                onProgress({
                    downloaded: progress.transferred,
                    total: progress.total || 0,
                    percent: progress.total
                        ? Math.round((progress.transferred / progress.total) * 100)
                        : 0
                })
            }
        })

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream)
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
            downloadStream.on('error', reject)
        })

        log.info(`Downloaded: ${filename}`)
        return { success: true, path: destPath, alreadyExists: false }
    }

    /**
     * Download mod + all required dependencies
     */
    async downloadModWithDeps(projectId, instanceModsDir, options = {}) {
        const { loaders = [], gameVersions = [] } = options
        const downloaded = []

        // Get versions
        const versions = await this.getProjectVersions(projectId, { loaders, gameVersions })
        if (versions.length === 0) {
            throw new Error(`No compatible versions found for project ${projectId}`)
        }

        // Get the best version (first = latest compatible)
        const version = versions[0]
        const primaryFile = version.files.find(f => f.primary) || version.files[0]

        if (!primaryFile) {
            throw new Error(`No files found for version ${version.id}`)
        }

        // Download main mod
        const result = await this.downloadMod(primaryFile.url, primaryFile.filename, instanceModsDir)
        downloaded.push({
            projectId,
            versionId: version.id,
            filename: primaryFile.filename,
            ...result
        })

        // Download required dependencies
        const requiredDeps = version.dependencies.filter(d => d.dependency_type === 'required')

        for (const dep of requiredDeps) {
            try {
                if (dep.project_id) {
                    const depVersions = await this.getProjectVersions(dep.project_id, { loaders, gameVersions })
                    if (depVersions.length > 0) {
                        const depVersion = depVersions[0]
                        const depFile = depVersion.files.find(f => f.primary) || depVersion.files[0]

                        if (depFile) {
                            const depResult = await this.downloadMod(depFile.url, depFile.filename, instanceModsDir)
                            downloaded.push({
                                projectId: dep.project_id,
                                versionId: depVersion.id,
                                filename: depFile.filename,
                                isDependency: true,
                                ...depResult
                            })
                        }
                    }
                }
            } catch (err) {
                log.warn(`Failed to download dependency ${dep.project_id}: ${err.message}`)
            }
        }

        return downloaded
    }

    // ========================================
    // TAGS & FILTERS (for building the sidebar)
    // ========================================

    /**
     * Get all categories from Modrinth
     */
    async getCategories() {
        try {
            const response = await got(`${MODRINTH_API}/tag/category`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body.map(c => ({
                name: c.name,
                projectType: c.project_type,
                header: c.header,
                icon: c.icon
            }))
        } catch (err) {
            log.error('Failed to get categories:', err.message)
            // Return hardcoded fallback
            return this.getDefaultCategories()
        }
    }

    /**
     * Get all loaders from Modrinth
     */
    async getLoaders() {
        try {
            const response = await got(`${MODRINTH_API}/tag/loader`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body.map(l => ({
                name: l.name,
                icon: l.icon,
                supportedProjectTypes: l.supported_project_types
            }))
        } catch (err) {
            log.error('Failed to get loaders:', err.message)
            return this.getDefaultLoaders()
        }
    }

    /**
     * Get all game versions from Modrinth
     */
    async getGameVersions() {
        try {
            const response = await got(`${MODRINTH_API}/tag/game_version`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })

            return response.body.map(v => ({
                version: v.version,
                versionType: v.version_type, // release, snapshot
                date: v.date,
                major: v.major
            }))
        } catch (err) {
            log.error('Failed to get game versions:', err.message)
            return []
        }
    }

    /**
     * Get license tags
     */
    async getLicenses() {
        try {
            const response = await got(`${MODRINTH_API}/tag/license`, {
                responseType: 'json',
                headers: { 'User-Agent': USER_AGENT }
            })
            return response.body
        } catch (err) {
            log.error('Failed to get licenses:', err.message)
            return []
        }
    }

    // ========================================
    // DEFAULT FALLBACK DATA
    // ========================================

    /**
     * Default categories matching Modrinth's sidebar
     */
    getDefaultCategories() {
        return [
            // Content categories
            { name: 'adventure', projectType: 'mod', header: 'Category' },
            { name: 'cursed', projectType: 'mod', header: 'Category' },
            { name: 'decoration', projectType: 'mod', header: 'Category' },
            { name: 'economy', projectType: 'mod', header: 'Category' },
            { name: 'equipment', projectType: 'mod', header: 'Category' },
            { name: 'food', projectType: 'mod', header: 'Category' },
            { name: 'game-mechanics', projectType: 'mod', header: 'Category' },
            { name: 'library', projectType: 'mod', header: 'Category' },
            { name: 'magic', projectType: 'mod', header: 'Category' },
            { name: 'management', projectType: 'mod', header: 'Category' },
            { name: 'minigame', projectType: 'mod', header: 'Category' },
            { name: 'mobs', projectType: 'mod', header: 'Category' },
            { name: 'optimization', projectType: 'mod', header: 'Category' },
            { name: 'social', projectType: 'mod', header: 'Category' },
            { name: 'storage', projectType: 'mod', header: 'Category' },
            { name: 'technology', projectType: 'mod', header: 'Category' },
            { name: 'transportation', projectType: 'mod', header: 'Category' },
            { name: 'utility', projectType: 'mod', header: 'Category' },
            { name: 'world-generation', projectType: 'mod', header: 'Category' }
        ]
    }

    /**
     * Default loaders
     */
    getDefaultLoaders() {
        return [
            { name: 'fabric', icon: null, supportedProjectTypes: ['mod'] },
            { name: 'forge', icon: null, supportedProjectTypes: ['mod'] },
            { name: 'neoforge', icon: null, supportedProjectTypes: ['mod'] },
            { name: 'quilt', icon: null, supportedProjectTypes: ['mod'] }
        ]
    }

    /**
     * Get all sidebar filter data in one call
     */
    async getAllFilters() {
        const [categories, loaders, gameVersions] = await Promise.all([
            this.getCategories(),
            this.getLoaders(),
            this.getGameVersions()
        ])

        // Organize into sidebar sections matching Modrinth layout
        return {
            gameVersion: {
                title: 'Game version',
                type: 'version-list',
                items: gameVersions
                    .filter(v => v.versionType === 'release')
                    .map(v => ({
                        value: v.version,
                        label: v.version,
                        major: v.major
                    }))
            },
            loader: {
                title: 'Loader',
                type: 'checkbox',
                items: loaders
                    .filter(l => l.supportedProjectTypes.includes('mod'))
                    .map(l => ({
                        value: l.name,
                        label: l.name.charAt(0).toUpperCase() + l.name.slice(1),
                        icon: l.icon
                    }))
            },
            category: {
                title: 'Category',
                type: 'checkbox',
                items: categories
                    .filter(c => c.projectType === 'mod' && c.header === 'categories')
                    .map(c => ({
                        value: c.name,
                        label: c.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                        icon: c.icon
                    }))
            },
            environment: {
                title: 'Environment',
                type: 'checkbox',
                items: [
                    { value: 'client', label: 'Client' },
                    { value: 'server', label: 'Server' }
                ]
            },
            license: {
                title: 'License',
                type: 'checkbox',
                items: [
                    { value: 'open-source', label: 'Open source' }
                ]
            },
            advanced: {
                title: 'Advanced',
                type: 'checkbox',
                items: [
                    { value: 'exclude-plugins', label: 'Exclude plugins' },
                    { value: 'exclude-datapacks', label: 'Exclude data packs' }
                ]
            }
        }
    }

    // ========================================
    // CONTENT TYPES (top tabs)
    // ========================================

    /**
     * Get content type tabs matching Modrinth's top bar
     */
    getContentTypes() {
        return [
            { id: 'mod', label: 'Mods', active: true },
            { id: 'resourcepack', label: 'Resource Packs', active: false },
            { id: 'datapack', label: 'Data Packs', active: false },
            { id: 'shader', label: 'Shaders', active: false },
            { id: 'modpack', label: 'Modpacks', active: false },
            { id: 'plugin', label: 'Plugins', active: false }
        ]
    }

    /**
     * Get sort options
     */
    getSortOptions() {
        return [
            { value: 'relevance', label: 'Relevance' },
            { value: 'downloads', label: 'Downloads' },
            { value: 'follows', label: 'Follows' },
            { value: 'newest', label: 'Newest' },
            { value: 'updated', label: 'Updated' }
        ]
    }

    /**
     * Get view options
     */
    getViewOptions() {
        return [10, 20, 50, 100]
    }

    // ========================================
    // UTILITY
    // ========================================

    /**
     * Format download count (e.g. 228.84M, 39.7K)
     */
    static formatDownloads(count) {
        if (count >= 1_000_000) {
            return (count / 1_000_000).toFixed(2) + 'M'
        }
        if (count >= 1_000) {
            return (count / 1_000).toFixed(1) + 'K'
        }
        return String(count)
    }

    /**
     * Format relative time (e.g. "Yesterday", "5 days ago", "2 months ago")
     */
    static formatRelativeTime(dateString) {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / (1000 * 60))
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const diffWeeks = Math.floor(diffDays / 7)
        const diffMonths = Math.floor(diffDays / 30)
        const diffYears = Math.floor(diffDays / 365)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        if (diffWeeks === 1) return 'Last week'
        if (diffWeeks < 4) return `${diffWeeks} weeks ago`
        if (diffMonths === 1) return 'Last month'
        if (diffMonths < 12) return `${diffMonths} months ago`
        if (diffYears === 1) return 'Last year'
        return `${diffYears} years ago`
    }

    /**
     * Format file size
     */
    static formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    /**
     * Check if mod is compatible with instance
     */
    isCompatible(modVersions, instanceLoader, instanceMCVersion) {
        return modVersions.some(v =>
            v.loaders.includes(instanceLoader) &&
            v.gameVersions.includes(instanceMCVersion)
        )
    }

    /**
     * Get best compatible version for instance
     */
    async getBestVersion(projectId, instanceLoader, instanceMCVersion) {
        const versions = await this.getProjectVersions(projectId, {
            loaders: [instanceLoader],
            gameVersions: [instanceMCVersion]
        })

        if (versions.length === 0) return null

        // Prefer release > beta > alpha
        const release = versions.find(v => v.versionType === 'release')
        return release || versions[0]
    }
}

module.exports = ModSearchManager
