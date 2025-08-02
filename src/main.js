import plugin from '../plugin.json'
const appSettings = acode.require('settings')

/**
 * OFFLINE FUNCTIONALITY ENHANCEMENT
 *
 * This file has been enhanced with offline functionality while preserving
 * the original codebase. The offline handler is imported and integrated
 * seamlessly to provide:
 *
 * - Automatic offline heartbeat storage
 * - Background sync when connection is restored
 * - Network status detection
 * - Retry mechanism for failed syncs
 *
 * @enhancement_version 1.0.0
 * @enhancement_author Dave Conco <concodave@gmail.com>
 * @original_author Original WakaTime Plugin Team
 */

// Import the offline functionality handler
import WakaTimeOfflineHandler from './offline.js'

/**
 * Validates the Wakatime API key format.
 * The key format must match the UUID structure, with an optional "waka_" prefix.
 *
 * @param {string} key - The Wakatime API key to be validated.
 * @returns {boolean} True if the key is valid, otherwise false.
 */
function apiKeyValid(key) {
	const re =
		/^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i

	return !(!key || !re.test(key))
}

// constants
const API_BASE_URL = 'https://api.wakatime.com/api/v1'
const HEARTBEAT_TIMEOUT = 120000 // 2 minutes

class WakaTimePlugin {
	constructor() {
		if (!this.settings) {
			appSettings.value[plugin.id] = {
				apiKey: null,
			}

			appSettings.update(false)
		}

		this.lastHeartbeat = {
			time: 0,
			file: null,
			project: null,
		}

		/**
		 * OFFLINE ENHANCEMENT: Initialize offline handler
		 * This provides automatic offline/online detection and heartbeat queuing
		 */
		this.offlineHandler = new WakaTimeOfflineHandler()

		this.handleFileSwitch = this.handleFileSwitch.bind(this)
		this.handleEditorChange = this.handleEditorChange.bind(this)
	}

	get settings() {
		return appSettings.value[plugin.id]
	}

	async init() {
		// Add event listener
		editorManager.on('switch-file', this.handleFileSwitch)
		editorManager.editor.on('change', this.handleEditorChange)

		/**
		 * OFFLINE ENHANCEMENT: Log offline handler status
		 */
		const stats = this.offlineHandler.getStats()
		if (stats.totalStored > 0) {
			console.log(
				`[WakaTime] Found ${stats.totalStored} offline heartbeats, will sync when online`
			)
		}
	}

	async destroy() {
		delete appSettings.value[plugin.id]
		appSettings.update(false)

		// Clean up event listeners
		editorManager.off('switch-file', this.handleFileSwitch)
		editorManager.editor.off('change', this.handleEditorChange)

		/**
		 * OFFLINE ENHANCEMENT: Clean up offline handler
		 */
		if (this.offlineHandler) {
			this.offlineHandler.destroy()
		}
	}

	isValidFile(file) {
		if (!file || window.addedFolder.length === 0) return false
		return window.addedFolder.some(dir => file.uri?.includes(dir.url))
	}

	async handleFileSwitch(file) {
		if (!this.isValidFile(file))
			return console.warn('[WakaTime] not valid file')
		await this.sendHeartbeat(file, true)
	}

	async handleEditorChange(changes) {
		const file = editorManager.activeFile
		if (!this.isValidFile(file))
			return console.warn('[WakaTime] not valid file')

		await this.sendHeartbeat(file, false)
	}

	isDuplicateHeartbeat(file, project, now) {
		if (!this.lastHeartbeat.file) return false

		return (
			this.lastHeartbeat.file === file &&
			this.lastHeartbeat.project === project &&
			now - this.lastHeartbeat.time < HEARTBEAT_TIMEOUT
		)
	}

	async sendHeartbeat(file, isWrite) {
		if (!this.settings.apiKey)
			return console.warn('[WakaTime] apiKey not found')

		const now = Date.now()
		const fileuri = file.uri
		const project = this.getProjectName(file)

		if (this.isDuplicateHeartbeat(fileuri, project, now))
			return console.warn('[WakaTime] Skipping duplicate heartbeat')

		this.lastHeartbeat = {
			time: now,
			file: fileuri,
			project,
		}

		const data = {
			entity: file.filename,
			type: 'file',
			time: now / 1000,
			is_write: isWrite,
			plugin: this.getPlugin(),
			language: this.getFileLanguage(file),
			project,
		}

		/**
		 * OFFLINE ENHANCEMENT: Enhanced heartbeat sending with offline support
		 *
		 * The original logic is preserved, but now we check if the device is online:
		 * - If online: Send immediately (original behavior)
		 * - If offline: Store for later sync
		 * - If online but send fails: Store for retry
		 */
		const isOnline = this.offlineHandler.isDeviceOnline()

		if (!isOnline) {
			// Device is offline - store heartbeat for later sync
			this.offlineHandler.storeHeartbeat(data, this.settings.apiKey)
			console.log(
				'[WakaTime] Device offline - heartbeat stored for later sync'
			)
			return
		}

		// Device is online - attempt to send immediately (original behavior)
		try {
			const response = await fetch(
				`${API_BASE_URL}/users/current/heartbeats`,
				{
					method: 'POST',
					headers: {
						Authorization: `Basic ${btoa(this.settings.apiKey)}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(data),
				}
			)

			if (!response.ok) {
				console.error(`WakaTime API error: ${response.status}`)

				/**
				 * OFFLINE ENHANCEMENT: Store failed heartbeats for retry
				 * If the API call fails, store the heartbeat for later retry
				 */
				this.offlineHandler.storeHeartbeat(data, this.settings.apiKey)
				console.log('[WakaTime] API error - heartbeat stored for retry')
			} else {
				console.log(
					'[Wakatime] send heartbeat successfully, response: ',
					await response.json()
				)
			}
		} catch (error) {
			console.error(error)

			/**
			 * OFFLINE ENHANCEMENT: Store heartbeats that failed due to network errors
			 */
			this.offlineHandler.storeHeartbeat(data, this.settings.apiKey)
			console.log('[WakaTime] Network error - heartbeat stored for retry')
		}
	}

	getFileLanguage(file) {
		return file.session.$modeId.split('/').pop() || 'Unknown'
	}

	getProjectName(file) {
		const folder = window.addedFolder.find(dir => file.uri.includes(dir.url))
		return folder?.title || 'Unknown Project'
	}

	getAgentName() {
		return window.BuildInfo?.displayName || 'Acode'
	}

	getAppVersion() {
		return (
			window.BuildInfo?.version ||
			document.body?.dataset?.version?.split(' ')[0] ||
			'0.0.0 (not found)'
		)
	}

	getPlugin() {
		const agent = `${this.getAgentName()}/${this.getAppVersion()} acode-wakatime/${
			plugin.version
		}`
		const os = window.device?.platform || null
		return os ? `(${os}) ${agent}` : agent
	}

	/**
	 * OFFLINE ENHANCEMENT: Enhanced settings with offline status information
	 * Added debugging/status information about offline functionality
	 */
	get settingsObj() {
		const offlineStats = this.offlineHandler.getStats()

		return {
			list: [
				{
					key: 'api_key',
					text: 'Wakatime API',
					value: this.settings.apiKey || '',
					prompt: 'Wakatime API',
					promptType: 'text',
					promptOptions: {
						required: true,
						placeholder: 'Your Wakatime API',
						test: apiKeyValid,
					},
				},
				/**
				 * OFFLINE ENHANCEMENT: Add offline status information to settings
				 * This provides visibility into the offline functionality
				 */
				{
					key: 'offline_status',
					text: `Offline Status: ${
						offlineStats.isOnline ? '🟢 Online' : '🔴 Offline'
					}`,
					value: `Pending heartbeats: ${offlineStats.totalStored}`,
					prompt: 'Offline Status (Read Only)',
					promptType: 'text',
					promptOptions: {
						required: false,
						readonly: true,
						placeholder: 'Status information',
					},
				},
				{
					key: 'force_sync',
					text: 'Force Sync Now',
					value: 'Tap to sync pending heartbeats',
					prompt: 'Force Sync',
					promptType: 'text',
					promptOptions: {
						required: false,
						readonly: true,
						placeholder: 'Force sync pending heartbeats',
					},
				},
			],
			cb: async (key, value) => {
				if (key === 'api_key') {
					this.settings.apiKey = value
					appSettings.update(false)
				} else if (key === 'force_sync') {
					/**
					 * OFFLINE ENHANCEMENT: Allow manual sync trigger from settings
					 */
					this.offlineHandler.forceSyncNow().then(function (success) {
						if (success) {
							console.log('[WakaTime] Manual sync completed')
							// You could show a toast notification here if Acode supports it
						}
					})
				}
			},
		}
	}

	/**
	 * OFFLINE ENHANCEMENT: Add method to get offline statistics
	 * This can be used by other parts of the application or for debugging
	 *
	 * @returns {Object} Offline handler statistics
	 */
	getOfflineStats() {
		return this.offlineHandler.getStats()
	}

	/**
	 * OFFLINE ENHANCEMENT: Add method to manually trigger sync
	 * Useful for debugging or manual intervention
	 *
	 * @returns {Promise<boolean>} Success status of sync operation
	 */
	syncNow() {
		return this.offlineHandler.forceSyncNow()
	}
}

// Initialize plugin
if (window.acode) {
	const Instance = new WakaTimePlugin()

	acode.setPluginInit(plugin.id, () => Instance.init(), Instance.settingsObj)

	acode.setPluginUnmount(plugin.id, () => Instance.destroy())

	/**
	 * OFFLINE ENHANCEMENT: Expose instance globally for debugging
	 * This allows developers to access offline functionality from console
	 * Usage: window.wakaTimePlugin.getOfflineStats()
	 */
	window.wakaTimePlugin = Instance
}
