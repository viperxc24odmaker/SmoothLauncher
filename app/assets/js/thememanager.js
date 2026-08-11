/**
 * ThemeManager
 * 
 * Manages launcher themes - allows users to create and switch themes
 * Stores custom color palettes and applies them dynamically
 * 
 * @module thememanager
 */

const ConfigManager = require('./configmanager')
const fs = require('fs-extra')
const path = require('path')

class ThemeManager {
    constructor() {
        this.themesPath = path.join(ConfigManager.getDataPath(), 'themes')
        this.currentTheme = null
        this.ensureThemesDir()
        this.loadThemes()
    }

    /**
     * Ensure themes directory exists
     */
    ensureThemesDir() {
        fs.ensureDirSync(this.themesPath)
    }

    /**
     * Get default themes
     */
    getDefaultThemes() {
        return {
            'makeforge-default': {
                name: 'MakeForge (Default)',
                author: 'MakeForge Studios',
                description: 'Warm, modern aesthetic with orange accents',
                colors: {
                    primary: '#ff8c42',
                    primary_light: '#ffa85a',
                    primary_dark: '#e67e38',
                    accent: '#ffc857',
                    accent_light: '#ffe6a0',
                    dark: '#1a1a2e',
                    dark_secondary: '#16213e',
                    dark_tertiary: '#0f3460',
                    cream: '#f5f1ed',
                    cream_dark: '#ebe3db',
                    gray: '#a5a5a5',
                    success: '#2ecc71',
                    warning: '#f39c12',
                    danger: '#e74c3c',
                    info: '#3498db'
                }
            },
            'dark-mode': {
                name: 'Dark Mode',
                author: 'MakeForge Studios',
                description: 'Pure dark theme with cool blue accents',
                colors: {
                    primary: '#00d4ff',
                    primary_light: '#1ae9ff',
                    primary_dark: '#00a8cc',
                    accent: '#00ffcc',
                    accent_light: '#66ffe5',
                    dark: '#0a0e27',
                    dark_secondary: '#1a1f3a',
                    dark_tertiary: '#252d4a',
                    cream: '#e8e8e8',
                    cream_dark: '#d0d0d0',
                    gray: '#909090',
                    success: '#00ff41',
                    warning: '#ffaa00',
                    danger: '#ff3333',
                    info: '#00ccff'
                }
            },
            'retro-pixel': {
                name: 'Retro Pixel',
                author: 'MakeForge Studios',
                description: 'Pixelated nostalgic theme',
                colors: {
                    primary: '#ff006e',
                    primary_light: '#ff1493',
                    primary_dark: '#c40060',
                    accent: '#ffbe0b',
                    accent_light: '#ffd60a',
                    dark: '#1d0b2d',
                    dark_secondary: '#380b61',
                    dark_tertiary: '#5a189a',
                    cream: '#f0f3ff',
                    cream_dark: '#c8b6db',
                    gray: '#8b7b9d',
                    success: '#06ff00',
                    warning: '#ff9500',
                    danger: '#ff0000',
                    info: '#0066ff'
                }
            },
            'forest-green': {
                name: 'Forest Green',
                author: 'MakeForge Studios',
                description: 'Nature-inspired green theme',
                colors: {
                    primary: '#2ecc71',
                    primary_light: '#27ae60',
                    primary_dark: '#229954',
                    accent: '#f39c12',
                    accent_light: '#f8b739',
                    dark: '#1b3a1b',
                    dark_secondary: '#1e5631',
                    dark_tertiary: '#2d6a4f',
                    cream: '#e8f5e9',
                    cream_dark: '#c8e6c9',
                    gray: '#81c784',
                    success: '#4caf50',
                    warning: '#ff9800',
                    danger: '#f44336',
                    info: '#00bcd4'
                }
            }
        }
    }

    /**
     * Load all themes
     */
    loadThemes() {
        this.themes = this.getDefaultThemes()
        
        try {
            const userThemes = fs.readJsonSync(
                path.join(this.themesPath, 'user_themes.json')
            )
            this.themes = { ...this.themes, ...userThemes }
        } catch (err) {
            // No user themes yet
        }

        const config = ConfigManager.load()
        this.currentTheme = config.currentTheme || 'makeforge-default'
    }

    /**
     * Get all available themes
     */
    getAllThemes() {
        return this.themes
    }

    /**
     * Get theme by ID
     */
    getTheme(themeId) {
        return this.themes[themeId] || null
    }

    /**
     * Get current theme
     */
    getCurrentTheme() {
        return this.themes[this.currentTheme] || this.themes['makeforge-default']
    }

    /**
     * Apply theme
     */
    applyTheme(themeId) {
        if (!this.themes[themeId]) {
            throw new Error(`Theme '${themeId}' not found`)
        }

        this.currentTheme = themeId
        const config = ConfigManager.load()
        config.currentTheme = themeId
        ConfigManager.save(config)

        return this.getCurrentTheme()
    }

    /**
     * Create custom theme
     */
    createTheme(themeId, themeData) {
        if (this.themes[themeId]) {
            throw new Error(`Theme '${themeId}' already exists`)
        }

        const newTheme = {
            name: themeData.name || themeId,
            author: themeData.author || 'Unknown',
            description: themeData.description || '',
            colors: themeData.colors || this.getDefaultThemes()['makeforge-default'].colors
        }

        this.themes[themeId] = newTheme
        this.saveUserThemes()
        return newTheme
    }

    /**
     * Update theme
     */
    updateTheme(themeId, themeData) {
        if (!this.themes[themeId]) {
            throw new Error(`Theme '${themeId}' not found`)
        }

        this.themes[themeId] = {
            ...this.themes[themeId],
            ...themeData
        }

        this.saveUserThemes()
        return this.themes[themeId]
    }

    /**
     * Delete theme
     */
    deleteTheme(themeId) {
        if (this.currentTheme === themeId) {
            this.applyTheme('makeforge-default')
        }

        delete this.themes[themeId]
        this.saveUserThemes()
        return true
    }

    /**
     * Save user themes to file
     */
    saveUserThemes() {
        const userThemes = {}
        const defaults = this.getDefaultThemes()

        for (const [id, theme] of Object.entries(this.themes)) {
            if (!defaults[id]) {
                userThemes[id] = theme
            }
        }

        fs.writeJsonSync(
            path.join(this.themesPath, 'user_themes.json'),
            userThemes,
            { spaces: 2 }
        )
    }

    /**
     * Export theme as CSS variables
     */
    exportAsCSS(themeId) {
        const theme = this.getTheme(themeId)
        if (!theme) return null

        let css = ':root {\n'
        for (const [key, value] of Object.entries(theme.colors)) {
            css += `  --mf-${key.replace(/_/g, '-')}: ${value};\n`
        }
        css += '}\n'

        return css
    }
}

module.exports = new ThemeManager()
