# Integration Guide - New Modules

This guide shows how to integrate the new **OfflineAuthManager** and **CosmeticsManager** into the existing launcher.

## Quick Start

### 1. Import in index.js

At the top of `index.js`, add:

```javascript
const OfflineAuthManager = require('./app/assets/js/offlineauthmanager')
const CosmeticsManager = require('./app/assets/js/cosmeticsmanager')
```

### 2. Add IPC Handlers

Add these handlers to `index.js` after the existing IPC setup:

```javascript
// ============================================
// OFFLINE TESTING MODE IPC HANDLERS
// ============================================

ipcMain.handle('toggleOfflineMode', async (event, enabled) => {
    OfflineAuthManager.setOfflineTestingMode(enabled)
    return { success: true, enabled }
})

ipcMain.handle('getOfflineTestAccounts', async (event) => {
    return OfflineAuthManager.getAllTestAccounts()
})

ipcMain.handle('createTestAccount', async (event, username) => {
    try {
        const account = OfflineAuthManager.createTestAccount(username)
        return { success: true, account }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

ipcMain.handle('deleteTestAccount', async (event, username) => {
    const success = OfflineAuthManager.deleteTestAccount(username)
    return { success }
})

ipcMain.handle('getTestAccount', async (event, username) => {
    const account = OfflineAuthManager.getTestAccount(username)
    return account || null
})

ipcMain.handle('isOfflineModeEnabled', async (event) => {
    return OfflineAuthManager.isOfflineTestingEnabled()
})

// ============================================
// COSMETICS SYSTEM IPC HANDLERS
// ============================================

ipcMain.handle('getCosmetics', async (event) => {
    return CosmeticsManager.getDefaultCosmetics()
})

ipcMain.handle('getCosmeticsByType', async (event, type) => {
    return CosmeticsManager.getCosmeticsByType(type)
})

ipcMain.handle('getUserCosmetics', async (event, userId) => {
    return CosmeticsManager.getUserCosmetics(userId)
})

ipcMain.handle('getEquippedCosmetics', async (event, userId) => {
    return CosmeticsManager.getEquippedCosmetics(userId)
})

ipcMain.handle('unlockCosmetic', async (event, userId, cosmeticId) => {
    try {
        CosmeticsManager.unlockCosmetic(userId, cosmeticId)
        return { success: true }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

ipcMain.handle('equipCosmetic', async (event, userId, cosmeticId) => {
    try {
        const success = CosmeticsManager.equipCosmetic(userId, cosmeticId)
        return { success }
    } catch (err) {
        return { success: false, error: err.message }
    }
})
```

---

## 3. Using in Renderer Process (EJS Templates)

### Offline Mode Toggle (settings.ejs)

```html
<div class="setting-item">
    <label>Offline Testing Mode</label>
    <input type="checkbox" id="offlineToggle" />
</div>

<script>
document.getElementById('offlineToggle').addEventListener('change', async (e) => {
    const result = await window.ipc.invoke('toggleOfflineMode', e.target.checked)
    if (result.success) {
        console.log('Offline mode:', result.enabled)
    }
})
</script>
```

### Test Account Selection (login.ejs)

```html
<div id="testAccounts" style="display: none;">
    <label>Select Test Account:</label>
    <select id="testAccountSelect">
        <option value="">Choose account...</option>
    </select>
</div>

<script>
// Show test accounts if offline mode enabled
window.ipc.invoke('isOfflineModeEnabled').then(enabled => {
    const testDiv = document.getElementById('testAccounts')
    if (enabled) {
        testDiv.style.display = 'block'
        loadTestAccounts()
    }
})

async function loadTestAccounts() {
    const accounts = await window.ipc.invoke('getOfflineTestAccounts')
    const select = document.getElementById('testAccountSelect')
    
    accounts.forEach(account => {
        const option = document.createElement('option')
        option.value = account.username
        option.textContent = account.username
        select.appendChild(option)
    })
}
</script>
```

### Cosmetics UI (landing.ejs)

```html
<div class="cosmetics-section">
    <h3>Cosmetics</h3>
    <div id="cosmeticsList"></div>
</div>

<script>
async function loadCosmetics(userId) {
    const cosmetics = await window.ipc.invoke('getCosmetics')
    const container = document.getElementById('cosmeticsList')
    
    // Display capes
    const capes = cosmetics.capes || {}
    for (const [id, cape] of Object.entries(capes)) {
        const btn = document.createElement('button')
        btn.textContent = cape.name
        btn.onclick = () => window.ipc.invoke('equipCosmetic', userId, id)
        container.appendChild(btn)
    }
}

async function getEquipped(userId) {
    return await window.ipc.invoke('getEquippedCosmetics', userId)
}
</script>
```

---

## 4. Integration Points

### In AuthManager (app/assets/js/authmanager.js)

When login succeeds, check if offline mode is active:

```javascript
// After successful login
if (OfflineAuthManager.isOfflineTestingEnabled()) {
    // Use test account instead of real auth
    const testAccount = OfflineAuthManager.getTestAccount(username)
    if (testAccount) {
        return testAccount
    }
}
```

### In ProcessBuilder (app/assets/js/processbuilder.js)

When launching, apply cosmetics:

```javascript
// Before launching game
const equipped = CosmeticsManager.getEquippedCosmetics(userId)
// Apply cosmetics to game args/resources
```

### In ConfigManager (app/assets/js/configmanager.js)

Make sure config includes cosmetics on save:

```javascript
exports.save = function(config) {
    // Existing save logic...
    if (config.cosmetics) {
        // Save cosmetics with other config
    }
}
```

---

## 5. Data Flow Diagram

```
Main Process (index.js)
    ↓
[IPC Handlers]
    ↓
OfflineAuthManager / CosmeticsManager
    ↓
[File System]
    ↓
data/test_accounts.json
data/config.json
```

---

## 6. Testing the Integration

### Test Offline Mode

```javascript
// In DevTools console
await window.ipc.invoke('toggleOfflineMode', true)
await window.ipc.invoke('getOfflineTestAccounts')
```

### Test Cosmetics

```javascript
// Unlock a cosmetic
await window.ipc.invoke('unlockCosmetic', 'userId123', 'dragon_wings')

// Equip cosmetic
await window.ipc.invoke('equipCosmetic', 'userId123', 'dragon_wings')

// Check equipped
await window.ipc.invoke('getEquippedCosmetics', 'userId123')
```

---

## 7. Error Handling

Always handle IPC promise rejections:

```javascript
try {
    const result = await window.ipc.invoke('toggleOfflineMode', true)
    if (result.success) {
        // Success
    } else {
        console.error('Error:', result.error)
    }
} catch (err) {
    console.error('IPC Error:', err)
}
```

---

## 8. Next Steps

1. ✅ Import modules in index.js
2. ✅ Add IPC handlers to index.js
3. ⬜ Update login.ejs to show test accounts
4. ⬜ Update settings.ejs to toggle offline mode
5. ⬜ Update landing.ejs to display cosmetics
6. ⬜ Hook up cosmetics to game launch process
7. ⬜ Test offline mode end-to-end
8. ⬜ Test cosmetics equipping

---

## 📞 Questions?

Check the MAKEFORGE_README.md for more context on architecture and APIs.
