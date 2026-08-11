# MakeForge Launcher

A modern Minecraft launcher built on Electron with an enhanced UX, cosmetics system, and offline testing capabilities.

## Features

✨ **Modern UI** - Clean, warm aesthetic with MakeForge branding
🎮 **Instance Management** - Create and manage multiple Minecraft instances
📦 **Mod Loader Support** - Fabric, Forge, NeoForge, and Vanilla
👥 **Account System** - Microsoft authentication + offline testing mode
🎨 **Cosmetics** - Wings, capes, accessories, and more
🔄 **Auto-Update** - Built-in update checking and installation
💾 **Config Management** - Persistent settings and preferences

## Installation

### Requirements

- Node.js 22.x or higher
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/viperxc24odmaker/MakeForgeModernLauncher.git
cd MakeForgeModernLauncher

# Install dependencies
npm install

# Start development
npm start

# Build distribution
npm run dist         # Multi-platform
npm run dist:win    # Windows only
npm run dist:mac    # macOS only
npm run dist:linux  # Linux only
```

## Offline Testing Mode

For development and testing without real Microsoft accounts:

### Enable Offline Testing

1. In the launcher settings, enable "Offline Testing Mode"
2. Use the built-in test accounts (TestPlayer1, TestPlayer2)
3. Create custom test accounts as needed

### Test Account API

```javascript
const OfflineAuthManager = require('./app/assets/js/offlineauthmanager')

// Create a test account
const account = OfflineAuthManager.createTestAccount('MyTestAccount')

// Get all test accounts
const accounts = OfflineAuthManager.getAllTestAccounts()

// Delete a test account
OfflineAuthManager.deleteTestAccount('MyTestAccount')

// Check if offline testing is enabled
const enabled = OfflineAuthManager.isOfflineTestingEnabled()
OfflineAuthManager.setOfflineTestingMode(true)
```

## Cosmetics System

### Available Cosmetics

- **Capes**: Blue, Red, MakeForge Gold
- **Wings**: Angel, Dragon, Pixel
- **Accessories**: Halo, Crown

### Using Cosmetics API

```javascript
const CosmeticsManager = require('./app/assets/js/cosmeticsmanager')

// Get all cosmetics of a type
const wings = CosmeticsManager.getCosmeticsByType('wings')

// Unlock cosmetic for user
CosmeticsManager.unlockCosmetic(userId, 'dragon_wings')

// Equip cosmetic
CosmeticsManager.equipCosmetic(userId, 'dragon_wings')

// Get user's equipped cosmetics
const equipped = CosmeticsManager.getEquippedCosmetics(userId)
```

## Architecture

```
MakeForgeModernLauncher/
├── index.js                 # Electron main process
├── app/
│   ├── assets/
│   │   ├── js/
│   │   │   ├── authmanager.js           # Authentication (Microsoft/Mojang)
│   │   │   ├── offlineauthmanager.js    # Offline testing
│   │   │   ├── configmanager.js         # Settings persistence
│   │   │   ├── cosmeticsmanager.js      # Cosmetics system
│   │   │   ├── distromanager.js         # Mod pack distribution
│   │   │   ├── processbuilder.js        # Instance launching
│   │   │   └── scripts/                 # UI scripts
│   │   └── css/
│   │       └── makeforge-theme.css      # Branding & styling
│   ├── *.ejs                # UI templates
│   └── landing.ejs          # Main launcher screen
├── build/                   # Build assets
├── .github/workflows/       # CI/CD pipelines
└── package.json
```

## IPC Communication

### Offline Mode Toggle

```javascript
// From renderer process
ipcRenderer.invoke('toggleOfflineMode', true)

// From main process
ipcMain.handle('toggleOfflineMode', async (event, enabled) => {
    OfflineAuthManager.setOfflineTestingMode(enabled)
    return true
})
```

### Cosmetics Update

```javascript
// From renderer
ipcRenderer.invoke('equipCosmetic', { userId, cosmeticId })

// From main
ipcMain.handle('equipCosmetic', async (event, { userId, cosmeticId }) => {
    return CosmeticsManager.equipCosmetic(userId, cosmeticId)
})
```

## GitHub Actions CI/CD

Automated builds for Windows, macOS, and Linux via `.github/workflows/build.yml`:

- Runs on every push to `main`/`master` and pull requests
- Automatic releases on version tags (`v*`)
- Multi-platform artifact generation

## Development

### Code Style

- ESLint configuration included
- Consistent formatting with prettier (optional)

```bash
npm run lint
```

### Adding New Features

1. Update core managers (authmanager, configmanager, etc.)
2. Add IPC handlers in `index.js` for renderer communication
3. Update EJS templates or create new ones
4. Add styling to `makeforge-theme.css`
5. Test in offline mode before production

## Configuration Files

- **`data/config.json`** - User settings
- **`data/test_accounts.json`** - Offline testing accounts (offline mode only)
- **`data/cosmetics/`** - Custom cosmetics storage

## License

MIT License - Built with ❤️ by Divine @ MakeForge Studios

## Credits

- Original Helios Launcher by [Daniel Scalzi](https://github.com/dscalzi)
- Modernized and enhanced by Divine for MakeForge Studios
- Built on [Electron](https://www.electronjs.org/), [helios-core](https://github.com/dscalzi/helios-core)

## Support

For issues, features, or questions:
- GitHub Issues: https://github.com/viperxc24odmaker/MakeForgeModernLauncher/issues
- MakeForge Discord: [Join our community]
