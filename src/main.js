import plugin from "../plugin.json";
const appSettings = acode.require("settings");

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
      } else {
        console.log(
          "[Wakatime] send heartbeat successfully, response: ",
          await response.json(),
        );
      }
    } catch (error) {
      console.error(error);
    }
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
      ],
      cb: (_, value) => {
        this.settings.apiKey = value;
        appSettings.update(false);
      },
    };
  }
}

// Initialize plugin
if (window.acode) {
  acode.setPluginInit(
    plugin.id,
    () => new WakaTimePlugin().init(),
    new WakaTimePlugin().settingsObj,
  );

  acode.setPluginUnmount(plugin.id, () => new AcodeEruda().destroy());
}
