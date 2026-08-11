const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')

const ConfigManager = require('./configmanager')
const AuthManager = require('./authmanager')
const ProcessBuilder = require('./processbuilder')

const ELY_AUTH_URL = 'https://authserver.ely.by'
const AUTHLIB_METADATA_URL = 'https://authlib-injector.yushi.moe/artifact/latest.json'
const AUTHLIB_JAR_PATH = path.join(ConfigManager.getLauncherDirectory(), 'authlib-injector.jar')

function offlineUuid(username) {
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest()
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    const hex = hash.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function ensureClientToken() {
    let token = ConfigManager.getClientToken()
    if(token == null) {
        token = crypto.randomUUID()
        ConfigManager.setClientToken(token)
    }
    return token
}

function authError(title, desc) {
    return {
        title,
        desc
    }
}

async function ensureAuthlibInjector() {
    fs.ensureDirSync(ConfigManager.getLauncherDirectory())

    const metadata = await got(AUTHLIB_METADATA_URL, { responseType: 'json' }).json()
    const downloadUrl = metadata.download_url
    const expectedSha256 = metadata.checksums?.sha256

    if(!downloadUrl || !expectedSha256) {
        throw new Error('The authlib-injector download metadata is incomplete.')
    }

    if(fs.existsSync(AUTHLIB_JAR_PATH)) {
        const currentHash = crypto.createHash('sha256').update(fs.readFileSync(AUTHLIB_JAR_PATH)).digest('hex')
        if(currentHash.toLowerCase() === expectedSha256.toLowerCase()) {
            return AUTHLIB_JAR_PATH
        }
    }

    const jar = await got(downloadUrl).buffer()
    const hash = crypto.createHash('sha256').update(jar).digest('hex')
    if(hash.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error('The downloaded authlib-injector failed SHA-256 verification.')
    }

    const tempPath = `${AUTHLIB_JAR_PATH}.tmp`
    fs.writeFileSync(tempPath, jar)
    fs.moveSync(tempPath, AUTHLIB_JAR_PATH, { overwrite: true })
    return AUTHLIB_JAR_PATH
}

ConfigManager.addOfflineAuthAccount = function(username) {
    const displayName = username.trim()
    if(!/^[A-Za-z0-9_]{1,16}$/.test(displayName)) {
        return Promise.reject(authError('Invalid Offline Username', 'Offline usernames must be 1-16 characters and use only letters, numbers, and underscores.'))
    }

    const uuid = offlineUuid(displayName)
    const account = {
        type: 'offline',
        accessToken: '0',
        username: displayName,
        uuid,
        displayName
    }

    ConfigManager.setSelectedAccount(uuid)
    ConfigManager.getAuthAccounts()[uuid] = account
    ConfigManager.save()
    return Promise.resolve(account)
}

ConfigManager.addElyByAuthAccount = function(uuid, accessToken, username, displayName, clientToken) {
    const account = {
        type: 'elyby',
        accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName.trim(),
        clientToken: clientToken.trim()
    }

    ConfigManager.getAuthAccounts()[account.uuid] = account
    ConfigManager.setSelectedAccount(account.uuid)
    return account
}

ConfigManager.updateElyByAuthAccount = function(uuid, accessToken) {
    const account = ConfigManager.getAuthAccount(uuid)
    account.accessToken = accessToken
    return account
}

AuthManager.addOfflineAccount = function(username) {
    return ConfigManager.addOfflineAuthAccount(username)
}

AuthManager.addElyByAccount = async function(username, password) {
    try {
        const clientToken = ensureClientToken()
        const response = await got.post(`${ELY_AUTH_URL}/auth/authenticate`, {
            json: {
                username,
                password,
                clientToken,
                requestUser: true
            },
            responseType: 'json',
            throwHttpErrors: false
        })

        const body = response.body || {}
        if(response.statusCode !== 200 || !body.selectedProfile || !body.accessToken) {
            const message = body.errorMessage || body.error || 'Ely.by authentication failed.'
            return Promise.reject(authError('Ely.by Login Failed', message))
        }

        await ensureAuthlibInjector()

        const ret = ConfigManager.addElyByAuthAccount(
            body.selectedProfile.id,
            body.accessToken,
            body.user?.username || username,
            body.selectedProfile.name,
            clientToken
        )
        ConfigManager.save()
        return ret
    } catch(err) {
        if(err?.title && err?.desc) {
            return Promise.reject(err)
        }
        console.error('Ely.by authentication error:', err)
        return Promise.reject(authError('Ely.by Login Failed', 'Unable to reach Ely.by or download the required authentication component. Check your internet connection and try again.'))
    }
}

AuthManager.removeElyByAccount = async function(uuid) {
    const account = ConfigManager.getAuthAccount(uuid)
    if(!account) return

    try {
        await got.post(`${ELY_AUTH_URL}/auth/invalidate`, {
            json: {
                accessToken: account.accessToken,
                clientToken: account.clientToken || ConfigManager.getClientToken()
            },
            responseType: 'json',
            throwHttpErrors: false
        })
    } catch(err) {
        console.warn('Ely.by token invalidation failed:', err)
    }

    ConfigManager.removeAuthAccount(uuid)
    ConfigManager.save()
}

const originalRemoveMojangAccount = AuthManager.removeMojangAccount
AuthManager.removeMojangAccount = async function(uuid) {
    const account = ConfigManager.getAuthAccount(uuid)
    if(account?.type === 'offline') {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return
    }
    if(account?.type === 'elyby') {
        return AuthManager.removeElyByAccount(uuid)
    }
    return originalRemoveMojangAccount(uuid)
}

async function validateElyByAccount(account) {
    const clientToken = account.clientToken || ConfigManager.getClientToken()

    const validate = await got.post(`${ELY_AUTH_URL}/auth/validate`, {
        json: { accessToken: account.accessToken },
        responseType: 'json',
        throwHttpErrors: false
    })

    if(validate.statusCode === 200) {
        return true
    }

    const refresh = await got.post(`${ELY_AUTH_URL}/auth/refresh`, {
        json: {
            accessToken: account.accessToken,
            clientToken,
            requestUser: true
        },
        responseType: 'json',
        throwHttpErrors: false
    })

    if(refresh.statusCode === 200 && refresh.body?.accessToken) {
        ConfigManager.updateElyByAuthAccount(account.uuid, refresh.body.accessToken)
        ConfigManager.save()
        return true
    }

    return false
}

const originalValidateSelected = AuthManager.validateSelected
AuthManager.validateSelected = async function() {
    const current = ConfigManager.getSelectedAccount()
    if(!current) return true

    if(current.type === 'offline') {
        return true
    }

    if(current.type === 'elyby') {
        try {
            return await validateElyByAccount(current)
        } catch(err) {
            console.error('Ely.by validation error:', err)
            return false
        }
    }

    return originalValidateSelected()
}

// Add the authlib-injector JVM argument automatically for Ely.by accounts.
const originalConstructJVMArguments = ProcessBuilder.prototype.constructJVMArguments
ProcessBuilder.prototype.constructJVMArguments = function(mods, tempNativePath) {
    const args = originalConstructJVMArguments.call(this, mods, tempNativePath)

    if(this.authUser?.type === 'elyby') {
        if(!fs.existsSync(AUTHLIB_JAR_PATH)) {
            throw new Error('authlib-injector is missing. Please log into Ely.by again so it can be downloaded.')
        }
        args.unshift(`-javaagent:${AUTHLIB_JAR_PATH}=${ELY_AUTH_URL}`)
        args.unshift('-Dauthlibinjector.noLogFile')
    } else if(this.authUser?.type === 'offline') {
        const userTypeIndex = args.indexOf('mojang')
        if(userTypeIndex !== -1) {
            args[userTypeIndex] = 'legacy'
        }
    }

    return args
}

// Dynamically add the alternative account buttons to the settings account tab.
document.addEventListener('DOMContentLoaded', () => {
    const accountTab = document.getElementById('settingsTabAccount')
    if(!accountTab || document.getElementById('settingsAddOfflineAccount')) return

    const container = document.createElement('div')
    container.className = 'settingsAuthAccountTypeContainer'
    container.innerHTML = `
        <div class="settingsAuthAccountTypeHeader">
            <div class="settingsAuthAccountTypeHeaderLeft">
                <span>Alternative Accounts</span>
            </div>
            <div class="settingsAuthAccountTypeHeaderRight">
                <button class="settingsAddAuthAccount" id="settingsAddElyByAccount">+ Add Ely.by Account</button>
                <button class="settingsAddAuthAccount" id="settingsAddOfflineAccount">+ Add Offline Account</button>
            </div>
        </div>
        <div class="settingsCurrentAccounts" id="settingsCurrentAlternativeAccounts"></div>
    `
    accountTab.appendChild(container)

    document.getElementById('settingsAddElyByAccount').onclick = () => {
        configureLoginMode('elyby')
        switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
            loginViewOnCancel = VIEWS.settings
            loginViewOnSuccess = VIEWS.settings
            loginCancelEnabled(true)
        })
    }

    document.getElementById('settingsAddOfflineAccount').onclick = () => {
        configureLoginMode('offline')
        switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
            loginViewOnCancel = VIEWS.settings
            loginViewOnSuccess = VIEWS.settings
            loginCancelEnabled(true)
        })
    }
})
