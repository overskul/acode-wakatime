/**
 * WakaTime Offline Handler
 *
 * This module provides offline functionality for the WakaTime Acode plugin.
 * It stores heartbeats locally when offline and syncs them when connection is restored.
 *
 * Features:
 * - Local storage of heartbeats when offline
 * - Automatic network detection
 * - Background sync when online
 * - Retry mechanism for failed syncs
 * - Data persistence across app restarts
 *
 * @author Dave Conco <concodave@gmail.com>
 * @version 1.0.0
 */

class WakaTimeOfflineHandler {
	constructor() {
		this.storageKey = 'wakatime_offline_heartbeats'
		this.syncInterval = 60000 // 60 seconds
		this.maxRetries = 3
		this.isOnline = navigator.onLine
		this.syncInProgress = false
		this.syncTimer = null

		this.init()
	}

	/**
	 * Initialize the offline handler
	 * Sets up network listeners and starts sync timer
	 */
	init() {
		// Listen for network status changes
		window.addEventListener('online', () => {
			console.log('[WakaTime Offline] Network connection restored')
			this.isOnline = true
			this.startSyncTimer()
		})

		window.addEventListener('offline', () => {
			console.log(
				'[WakaTime Offline] Network connection lost - switching to offline mode'
			)
			this.isOnline = false
			this.stopSyncTimer()
		})

		// Start sync timer if online
		if (this.isOnline) {
			this.startSyncTimer()
		}

		console.log('[WakaTime Offline] Offline handler initialized')
	}

	/**
	 * Store a heartbeat for later sync when offline
	 * @param {Object} heartbeatData - The heartbeat data to store
	 * @param {string} apiKey - The API key for authentication
	 */
	storeHeartbeat(heartbeatData, apiKey) {
		try {
			const storedData = this.getStoredHeartbeats()
			const heartbeatWithAuth = Object.assign({}, heartbeatData, {
				apiKey: apiKey,
				timestamp: Date.now(),
				retryCount: 0,
			})

			storedData.push(heartbeatWithAuth)

			// Limit stored heartbeats to prevent storage overflow
			if (storedData.length > 1000) {
				storedData.splice(0, storedData.length - 1000)
			}

			localStorage.setItem(this.storageKey, JSON.stringify(storedData))

			console.log(
				`[WakaTime Offline] Heartbeat stored offline (${storedData.length} pending)`
			)
		} catch (error) {
			console.error('[WakaTime Offline] Failed to store heartbeat:', error)
		}
	}

	/**
	 * Get all stored heartbeats from localStorage
	 * @returns {Array} Array of stored heartbeat objects
	 */
	getStoredHeartbeats() {
		try {
			const stored = localStorage.getItem(this.storageKey)
			return stored ? JSON.parse(stored) : []
		} catch (error) {
			console.error(
				'[WakaTime Offline] Failed to retrieve stored heartbeats:',
				error
			)
			return []
		}
	}

	/**
	 * Clear all stored heartbeats
	 */
	clearStoredHeartbeats() {
		try {
			localStorage.removeItem(this.storageKey)
			console.log('[WakaTime Offline] Cleared all stored heartbeats')
		} catch (error) {
			console.error(
				'[WakaTime Offline] Failed to clear stored heartbeats:',
				error
			)
		}
	}

	/**
	 * Start the periodic sync timer
	 */
	startSyncTimer() {
		if (this.syncTimer) {
			clearInterval(this.syncTimer)
		}

		this.syncTimer = setInterval(() => {
			this.syncStoredHeartbeats()
		}, this.syncInterval)

		// Immediate sync attempt
		setTimeout(() => this.syncStoredHeartbeats(), 1000)
	}

	/**
	 * Stop the periodic sync timer
	 */
	stopSyncTimer() {
		if (this.syncTimer) {
			clearInterval(this.syncTimer)
			this.syncTimer = null
		}
	}

	/**
	 * Sync all stored heartbeats to WakaTime API
	 */
	syncStoredHeartbeats() {
		const self = this

		if (!this.isOnline || this.syncInProgress) {
			return Promise.resolve()
		}

		const storedHeartbeats = this.getStoredHeartbeats()
		if (storedHeartbeats.length === 0) {
			return Promise.resolve()
		}

		this.syncInProgress = true
		console.log(
			`[WakaTime Offline] Starting sync of ${storedHeartbeats.length} heartbeats`
		)

		const successfulSyncs = []
		const failedSyncs = []

		// Process heartbeats sequentially to avoid overwhelming the API
		const processHeartbeats = function (index) {
			if (index >= storedHeartbeats.length) {
				// All heartbeats processed
				if (failedSyncs.length > 0) {
					localStorage.setItem(
						self.storageKey,
						JSON.stringify(failedSyncs)
					)
				} else {
					self.clearStoredHeartbeats()
				}

				if (successfulSyncs.length > 0) {
					console.log(
						`[WakaTime Offline] Successfully synced ${successfulSyncs.length} heartbeats`
					)
				}

				if (failedSyncs.length > 0) {
					console.log(
						`[WakaTime Offline] ${failedSyncs.length} heartbeats failed to sync, will retry`
					)
				}

				self.syncInProgress = false
				return Promise.resolve()
			}

			const heartbeat = storedHeartbeats[index]

			return self
				.syncSingleHeartbeat(heartbeat)
				.then(function (success) {
					if (success) {
						successfulSyncs.push(heartbeat)
					} else {
						heartbeat.retryCount = (heartbeat.retryCount || 0) + 1
						if (heartbeat.retryCount < self.maxRetries) {
							failedSyncs.push(heartbeat)
						} else {
							console.warn(
								'[WakaTime Offline] Dropping heartbeat after max retries:',
								heartbeat
							)
						}
					}
					return processHeartbeats(index + 1)
				})
				.catch(function (error) {
					console.error(
						'[WakaTime Offline] Error syncing heartbeat:',
						error
					)
					heartbeat.retryCount = (heartbeat.retryCount || 0) + 1
					if (heartbeat.retryCount < self.maxRetries) {
						failedSyncs.push(heartbeat)
					}
					return processHeartbeats(index + 1)
				})
		}

		return processHeartbeats(0)
	}

	/**
	 * Sync a single heartbeat to the WakaTime API
	 * @param {Object} heartbeat - The heartbeat data to sync
	 * @returns {Promise<boolean>} True if sync was successful
	 */
	syncSingleHeartbeat(heartbeat) {
		const API_BASE_URL = 'https://api.wakatime.com/api/v1'

		// Create a clean heartbeat object without our metadata
		const cleanHeartbeat = {
			entity: heartbeat.entity,
			type: heartbeat.type,
			time: heartbeat.time,
			is_write: heartbeat.is_write,
			plugin: heartbeat.plugin,
			language: heartbeat.language,
			project: heartbeat.project,
		}

		return fetch(`${API_BASE_URL}/users/current/heartbeats`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${btoa(heartbeat.apiKey)}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(cleanHeartbeat),
		})
			.then(function (response) {
				if (response.ok) {
					return true
				} else {
					console.error(
						`[WakaTime Offline] API error during sync: ${response.status}`
					)
					return false
				}
			})
			.catch(function (error) {
				console.error(
					'[WakaTime Offline] Network error during sync:',
					error
				)
				return false
			})
	}

	/**
	 * Check if the device is currently online
	 * @returns {boolean} True if online
	 */
	isDeviceOnline() {
		return this.isOnline && navigator.onLine
	}

	/**
	 * Get statistics about stored heartbeats
	 * @returns {Object} Statistics object
	 */
	getStats() {
		const stored = this.getStoredHeartbeats()
		const timestamps = stored.map(function (h) {
			return h.timestamp
		})

		return {
			totalStored: stored.length,
			oldestHeartbeat:
				stored.length > 0
					? new Date(Math.min.apply(Math, timestamps))
					: null,
			newestHeartbeat:
				stored.length > 0
					? new Date(Math.max.apply(Math, timestamps))
					: null,
			isOnline: this.isOnline,
			syncInProgress: this.syncInProgress,
		}
	}

	/**
	 * Manually trigger a sync (useful for testing or forced sync)
	 */
	forceSyncNow() {
		if (!this.isOnline) {
			console.warn(
				'[WakaTime Offline] Cannot force sync - device is offline'
			)
			return Promise.resolve(false)
		}

		console.log('[WakaTime Offline] Force sync triggered')
		return this.syncStoredHeartbeats().then(function () {
			return true
		})
	}

	/**
	 * Clean up resources when plugin is destroyed
	 */
	destroy() {
		this.stopSyncTimer()
		window.removeEventListener('online', this.handleOnline)
		window.removeEventListener('offline', this.handleOffline)
		console.log('[WakaTime Offline] Offline handler destroyed')
	}
}

// Export the class for use in main.js
export default WakaTimeOfflineHandler
