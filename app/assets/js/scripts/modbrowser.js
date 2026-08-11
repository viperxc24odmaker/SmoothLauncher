/**
 * Mod Browser UI Script
 * 
 * Handles Modrinth search, filter selection, pagination, and mod card rendering
 */

const ModSearchManager = require('../modsearchmanager')
const ConfigManager = require('../configmanager')

const modSearch = new ModSearchManager(ConfigManager.getDataPath())

// State
let currentFilters = {
    query: '',
    categories: [],
    loaders: [],
    versions: [],
    environment: null,
    license: null,
    projectType: 'mod',
    sortBy: 'relevance',
    limit: 20,
    offset: 0
}
let currentResults = null

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initModBrowser()
})

function initModBrowser() {
    // Search input
    const searchInput = document.getElementById('modSearchInput')
    let searchTimeout = null
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(() => {
            currentFilters.query = e.target.value
            currentFilters.offset = 0
            performSearch()
        }, 400)
    })

    // Tab buttons
    document.querySelectorAll('.modTab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.modTab').forEach(t => t.classList.remove('modTabActive'))
            tab.classList.add('modTabActive')
            currentFilters.projectType = tab.dataset.type
            currentFilters.offset = 0
            performSearch()
        })
    })

    // Sort select
    document.getElementById('modSortSelect').addEventListener('change', (e) => {
        currentFilters.sortBy = e.target.value
        currentFilters.offset = 0
        performSearch()
    })

    // View select
    document.getElementById('modViewSelect').addEventListener('change', (e) => {
        currentFilters.limit = parseInt(e.target.value)
        currentFilters.offset = 0
        performSearch()
    })

    // Filter checkboxes
    initFilterCheckboxes()

    // Collapsible sections
    document.querySelectorAll('.modFilterHeader').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.collapse
            const body = document.getElementById(targetId)
            const arrow = header.querySelector('.modFilterArrow')
            if (body.style.display === 'none') {
                body.style.display = 'block'
                arrow.textContent = '▾'
            } else {
                body.style.display = 'none'
                arrow.textContent = '▸'
            }
        })
    })

    // Version search filter
    document.getElementById('versionSearch').addEventListener('input', (e) => {
        filterVersionList(e.target.value)
    })

    // Load game versions
    loadGameVersions()
}

// ========================================
// FILTERS
// ========================================

function initFilterCheckboxes() {
    // Loader checkboxes
    document.querySelectorAll('#loaderFilter input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            currentFilters.loaders = getCheckedValues('#loaderFilter')
            currentFilters.offset = 0
            performSearch()
        })
    })

    // Category checkboxes
    document.querySelectorAll('#categoryFilter input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            currentFilters.categories = getCheckedValues('#categoryFilter')
            currentFilters.offset = 0
            performSearch()
        })
    })

    // Environment checkboxes
    document.querySelectorAll('#envFilter input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const checked = getCheckedValues('#envFilter')
            currentFilters.environment = checked.length > 0 ? checked[0] : null
            currentFilters.offset = 0
            performSearch()
        })
    })

    // License checkboxes
    document.querySelectorAll('#licenseFilter input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const checked = getCheckedValues('#licenseFilter')
            currentFilters.license = checked.length > 0 ? checked[0] : null
            currentFilters.offset = 0
            performSearch()
        })
    })
}

function getCheckedValues(containerSelector) {
    const checks = document.querySelectorAll(`${containerSelector} input[type="checkbox"]:checked`)
    return Array.from(checks).map(cb => cb.value)
}

async function loadGameVersions() {
    try {
        const versions = await modSearch.getGameVersions()
        const releaseVersions = versions.filter(v => v.versionType === 'release')
        const list = document.getElementById('versionList')

        releaseVersions.slice(0, 30).forEach(v => {
            const label = document.createElement('label')
            label.className = 'modFilterCheck modVersionItem'
            label.innerHTML = `<input type="checkbox" value="${v.version}"> ${v.version}`
            label.querySelector('input').addEventListener('change', () => {
                currentFilters.versions = getCheckedValues('#versionList')
                currentFilters.offset = 0
                performSearch()
            })
            list.appendChild(label)
        })
    } catch (err) {
        console.error('Failed to load game versions:', err)
    }
}

function filterVersionList(query) {
    const items = document.querySelectorAll('.modVersionItem')
    items.forEach(item => {
        const text = item.textContent.toLowerCase()
        item.style.display = text.includes(query.toLowerCase()) ? '' : 'none'
    })
}

// ========================================
// SEARCH
// ========================================

async function performSearch() {
    const spinner = document.getElementById('modLoadingSpinner')
    const noResults = document.getElementById('modNoResults')
    const cardsList = document.getElementById('modCardsList')

    // Show loading
    spinner.style.display = 'flex'
    noResults.style.display = 'none'

    // Clear existing cards (keep spinner and noResults)
    const existingCards = cardsList.querySelectorAll('.modCard')
    existingCards.forEach(c => c.remove())

    try {
        currentResults = await modSearch.search(currentFilters)
        spinner.style.display = 'none'

        if (currentResults.hits.length === 0) {
            noResults.style.display = 'flex'
            return
        }

        // Render mod cards
        currentResults.hits.forEach(mod => {
            const card = createModCard(mod)
            cardsList.appendChild(card)
        })

        // Update pagination
        updatePagination()
    } catch (err) {
        spinner.style.display = 'none'
        noResults.style.display = 'flex'
        noResults.querySelector('span').textContent = 'Search failed. Check your connection.'
        console.error('Search failed:', err)
    }
}

// ========================================
// MOD CARD RENDERING
// ========================================

function createModCard(mod) {
    const card = document.createElement('div')
    card.className = 'modCard'
    card.dataset.projectId = mod.id

    // Build tags HTML
    const tags = mod.displayCategories.map(cat => {
        let tagClass = 'modTag'
        const catLower = cat.toLowerCase()
        if (catLower === 'fabric') tagClass += ' modTagFabric'
        else if (catLower === 'forge') tagClass += ' modTagForge'
        else if (catLower === 'neoforge') tagClass += ' modTagNeoForge'
        else if (catLower === 'quilt') tagClass += ' modTagQuilt'
        return `<span class="${tagClass}">${cat}</span>`
    }).join('')

    // Environment tags
    let envTags = ''
    if (mod.clientSide === 'required' || mod.clientSide === 'optional') {
        envTags += '<span class="modTag modTagEnv">Client</span>'
    }
    if (mod.serverSide === 'required' || mod.serverSide === 'optional') {
        envTags += '<span class="modTag modTagEnv">Server</span>'
    }

    card.innerHTML = `
        <div class="modCardIcon">
            <img src="${mod.iconUrl || 'assets/images/SealCircle.png'}" alt="${mod.title}" onerror="this.src='assets/images/SealCircle.png'">
        </div>
        <div class="modCardInfo">
            <div class="modCardHeader">
                <h3 class="modCardTitle">${mod.title}</h3>
                <span class="modCardAuthor">by ${mod.author}</span>
            </div>
            <p class="modCardDesc">${mod.description}</p>
            <div class="modCardTags">
                ${envTags}
                ${tags}
            </div>
        </div>
        <div class="modCardStats">
            <div class="modCardStat">
                <span class="modStatIcon">↓</span>
                <span class="modStatValue">${ModSearchManager.formatDownloads(mod.downloads)}</span>
            </div>
            <div class="modCardStat">
                <span class="modStatIcon">♡</span>
                <span class="modStatValue">${ModSearchManager.formatDownloads(mod.follows)}</span>
            </div>
            <div class="modCardStat">
                <span class="modStatIcon">⏱</span>
                <span class="modStatValue">${ModSearchManager.formatRelativeTime(mod.dateModified)}</span>
            </div>
        </div>
    `

    // Click to install
    card.addEventListener('click', () => showModDetails(mod))

    return card
}

// ========================================
// MOD DETAILS / INSTALL
// ========================================

async function showModDetails(mod) {
    // Use the overlay system to show mod details
    const overlay = document.getElementById('overlayContainer')
    if (!overlay) return

    try {
        const project = await modSearch.getProject(mod.id)
        const versions = await modSearch.getProjectVersions(mod.id)

        // Simple install dialog via overlay
        const confirmed = confirm(`Install "${mod.title}" by ${mod.author}?\n\n${mod.description}\n\nDownloads: ${ModSearchManager.formatDownloads(mod.downloads)}`)

        if (confirmed && versions.length > 0) {
            const version = versions[0]
            const file = version.files.find(f => f.primary) || version.files[0]

            if (file) {
                // Get current instance mods dir
                const InstanceManager = require('../instancemanager')
                const instanceMgr = new InstanceManager(ConfigManager.getDataPath())
                const instances = instanceMgr.getAllInstances()

                if (instances.length > 0) {
                    const modsDir = require('path').join(instances[0].gameDir, 'mods')
                    await modSearch.downloadMod(file.url, file.filename, modsDir)
                    alert(`Installed ${mod.title} v${version.versionNumber}!`)
                } else {
                    alert('Create an instance first before installing mods.')
                }
            }
        }
    } catch (err) {
        console.error('Failed to get mod details:', err)
        alert('Failed to load mod details. Check your connection.')
    }
}

// ========================================
// PAGINATION
// ========================================

function updatePagination() {
    const container = document.getElementById('modPagination')
    if (!currentResults) return

    const { totalPages, currentPage, totalHits } = currentResults
    container.innerHTML = ''

    if (totalPages <= 1) return

    // Previous button
    if (currentPage > 1) {
        const prev = createPageBtn('‹', () => goToPage(currentPage - 1))
        container.appendChild(prev)
    }

    // Page numbers
    const maxVisible = 5
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1)
    }

    if (start > 1) {
        container.appendChild(createPageBtn('1', () => goToPage(1)))
        if (start > 2) container.appendChild(createPageDots())
    }

    for (let i = start; i <= end; i++) {
        const btn = createPageBtn(String(i), () => goToPage(i))
        if (i === currentPage) btn.classList.add('modPageActive')
        container.appendChild(btn)
    }

    if (end < totalPages) {
        if (end < totalPages - 1) container.appendChild(createPageDots())
        container.appendChild(createPageBtn(String(totalPages), () => goToPage(totalPages)))
    }

    // Next button
    if (currentPage < totalPages) {
        const next = createPageBtn('›', () => goToPage(currentPage + 1))
        container.appendChild(next)
    }
}

function createPageBtn(text, onClick) {
    const btn = document.createElement('button')
    btn.className = 'modPageBtn'
    btn.textContent = text
    btn.addEventListener('click', onClick)
    return btn
}

function createPageDots() {
    const span = document.createElement('span')
    span.className = 'modPageDots'
    span.textContent = '...'
    return span
}

function goToPage(page) {
    currentFilters.offset = (page - 1) * currentFilters.limit
    performSearch()
}

// Export for external use
if (typeof module !== 'undefined') {
    module.exports = { performSearch, currentFilters }
}
