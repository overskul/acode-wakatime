import plugin from '../plugin.json'
const appSettings = acode.require('settings')

/**
 * Validates the Wakatime API key format.
 * The key format must match the UUID structure, with an optional "waka_" prefix.
 *
 * @param {string} key - The Wakatime API key to be validated.
 * @returns {boolean} True if the key is valid, otherwise false.
 */
function apiKeyValid(key) {
  const re =
    /^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

  return !(!key || !re.test(key));
}

// constants
const API_BASE_URL = "https://api.wakatime.com/api/v1";
const HEARTBEAT_TIMEOUT = 120000; // 2 minutes

class WakaTimePlugin {
  constructor() {
    if (!this.settings) {
      appSettings.value[plugin.id] = {
        apiKey: null,
      };

      appSettings.update(false);
    }

    this.lastHeartbeat = {
      time: 0,
      file: null,
      project: null,
    };

    // Offline storage key
    this.offlineStorageKey = 'wakatime_offline_heartbeats';
    
    // Start background sync timer
    this.startBackgroundSync();

    this.handleFileSwitch = this.handleFileSwitch.bind(this);
    this.handleEditorChange = this.handleEditorChange.bind(this);
  }

  get settings() {
    return appSettings.value[plugin.id];
  }

  async init() {
    // Add event listener
    editorManager.on("switch-file", this.handleFileSwitch);
    editorManager.editor.on("change", this.handleEditorChange);
  }

  async destroy() {
    delete appSettings.value[plugin.id];
    appSettings.update(false);

    // Clean up event listeners
    editorManager.off("switch-file", this.handleFileSwitch);
    editorManager.editor.off("change", this.handleEditorChange);
    
    // Stop background sync
    this.stopBackgroundSync();
  }

  isValidFile(file) {
    if (!file || window.addedFolder.length === 0) return false;
    return window.addedFolder.some((dir) => file.uri?.includes(dir.url));
  }

  async handleFileSwitch(file) {
    if (!this.isValidFile(file))
      return console.warn("[WakaTime] not valid file");
    await this.sendHeartbeat(file, true);
  }

  async handleEditorChange(changes) {
    const file = editorManager.activeFile;
    if (!this.isValidFile(file))
      return console.warn("[WakaTime] not valid file");

    await this.sendHeartbeat(file, false);
  }

  isDuplicateHeartbeat(file, project, now) {
    if (!this.lastHeartbeat.file) return false;

    return (
      this.lastHeartbeat.file === file &&
      this.lastHeartbeat.project === project &&
      now - this.lastHeartbeat.time < HEARTBEAT_TIMEOUT
    );
  }

  async sendHeartbeat(file, isWrite) {
    if (!this.settings.apiKey)
      return console.warn("[WakaTime] apiKey not found");

    const now = Date.now();
    const fileuri = file.uri;
    const project = this.getProjectName(file);

    if (this.isDuplicateHeartbeat(fileuri, project, now))
      return console.warn("[WakaTime] Skipping duplicate heartbeat");

    this.lastHeartbeat = {
      time: now,
      file: fileuri,
      project,
    };

    const data = {
      entity: file.filename,
      type: "file",
      time: now / 1000,
      is_write: isWrite,
      plugin: this.getPlugin(),
      language: this.getFileLanguage(file),
      project,
    };

    // ORIGINAL CODE - Try to send online first
    try {
      const response = await fetch(`${API_BASE_URL}/users/current/heartbeats`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(this.settings.apiKey)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.error(`WakaTime API error: ${response.status}`);
        // OFFLINE ENHANCEMENT: Store failed heartbeat
        this.storeOfflineHeartbeat(data);
      } else {
        console.log(
          "[Wakatime] send heartbeat successfully, response: ",
          await response.json(),
        );
      }
    } catch (error) {
      console.error(error);
      // OFFLINE ENHANCEMENT: Store failed heartbeat
      this.storeOfflineHeartbeat(data);
    }
  }

  // OFFLINE ENHANCEMENT: Store heartbeat for later sync
  storeOfflineHeartbeat(data) {
    try {
      const stored = JSON.parse(localStorage.getItem(this.offlineStorageKey) || '[]');
      const heartbeatWithAuth = {
        ...data,
        apiKey: this.settings.apiKey,
        timestamp: Date.now()
      };
      
      stored.push(heartbeatWithAuth);
      
      // Limit to 500 heartbeats to prevent storage overflow
      if (stored.length > 500) {
        stored.splice(0, stored.length - 500);
      }
      
      localStorage.setItem(this.offlineStorageKey, JSON.stringify(stored));
      console.log(`[WakaTime] Heartbeat stored offline (${stored.length} pending)`);
    } catch (error) {
      console.error('[WakaTime] Failed to store offline heartbeat:', error);
    }
  }

  // OFFLINE ENHANCEMENT: Background sync every 2 minutes
  startBackgroundSync() {
    this.syncInterval = setInterval(() => {
      this.syncOfflineHeartbeats();
    }, 120000); // 2 minutes
    
    // Initial sync after 10 seconds
    setTimeout(() => this.syncOfflineHeartbeats(), 10000);
  }

  stopBackgroundSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  // OFFLINE ENHANCEMENT: Sync stored heartbeats
  async syncOfflineHeartbeats() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.offlineStorageKey) || '[]');
      if (stored.length === 0) return;

      console.log(`[WakaTime] Syncing ${stored.length} offline heartbeats`);
      
      const successful = [];
      
      for (const heartbeat of stored) {
        try {
          const cleanData = {
            entity: heartbeat.entity,
            type: heartbeat.type,
            time: heartbeat.time,
            is_write: heartbeat.is_write,
            plugin: heartbeat.plugin,
            language: heartbeat.language,
            project: heartbeat.project,
          };

          const response = await fetch(`${API_BASE_URL}/users/current/heartbeats`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(heartbeat.apiKey)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cleanData),
          });

          if (response.ok) {
            successful.push(heartbeat);
          }
        } catch (error) {
          // Skip failed heartbeats, they'll be retried next time
          continue;
        }
      }

      // Remove successful heartbeats from storage
      if (successful.length > 0) {
        const remaining = stored.filter(h => !successful.some(s => s.timestamp === h.timestamp));
        localStorage.setItem(this.offlineStorageKey, JSON.stringify(remaining));
        console.log(`[WakaTime] Successfully synced ${successful.length} heartbeats, ${remaining.length} remaining`);
      }
    } catch (error) {
      console.error('[WakaTime] Error during offline sync:', error);
    }
  }

  // OFFLINE ENHANCEMENT: Get offline stats
  getOfflineStats() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.offlineStorageKey) || '[]');
      return {
        count: stored.length,
        oldestTimestamp: stored.length > 0 ? Math.min(...stored.map(h => h.timestamp)) : null
      };
    } catch (error) {
      return { count: 0, oldestTimestamp: null };
    }
  }
  
  getConnectionStatus() {
     return window.navigator.onLine ? 'Online 🟢' : 'Offline 🟠';
  }

  getFileLanguage(file) {
    return file.session.$modeId.split("/").pop() || "Unknown";
  }

  getProjectName(file) {
    const folder = window.addedFolder.find((dir) => file.uri.includes(dir.url));
    return folder?.title || "Unknown Project";
  }

  getAgentName() {
    return window.BuildInfo?.displayName || "Acode";
  }

  getAppVersion() {
    return (
      window.BuildInfo?.version ||
      document.body?.dataset?.version?.split(" ")[0] ||
      "0.0.0 (not found)"
    );
  }

  getPlugin() {
    const agent = `${this.getAgentName()}/${this.getAppVersion()} acode-wakatime/${
      plugin.version
    }`;
    const os = window.device?.platform || null;
    return os ? `(${os}) ${agent}` : agent;
  }

  get settingsObj() {
    const stats = this.getOfflineStats();
    const connectionStatus = this.getConnectionStatus();
    const statusText = stats.count > 0 ? 
      `${stats.count} heartbeats pending sync` : 
      'All synced';

    return {
      list: [
        {
          key: "api_key",
          text: "Wakatime API",
          value: this.settings.apiKey || "",
          prompt: "Wakatime API",
          promptType: "text",
          promptOptions: {
            required: true,
            placeholder: "Your Wakatime API",
            test: apiKeyValid,
          },
        },
        {
          key: "offline_info",
          text: `Offline: ${statusText}`,
          value: "",
          prompt: "",
          promptType: "info",
        },
        {
          key: "connection_status",
          text: `Connection Status: ${connectionStatus}`,
          value: "",
          prompt: "",
          promptType: "info",
        },
      ],
      cb: (key, value) => {
        if (key === "api_key") {
          this.settings.apiKey = value;
          appSettings.update(false);
        }
      },
    };
  }
}

// Initialize plugin
if (window.acode) {
  
  const Instance = new WakaTimePlugin();
  
  acode.setPluginInit(plugin.id, () => Instance.init(), Instance.settingsObj);

  acode.setPluginUnmount(plugin.id, () => Instance.destroy());
  
};