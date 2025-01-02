import plugin from "../plugin.json";

const appSettings = acode.require("settings");
const modeList = ace.require("ace/ext/modelist");
const sidebar = acode.require("sidebarApps");

class WakaTimePlugin {
  constructor() {
    if (!appSettings.value[plugin.id]) {
      appSettings.value[plugin.id] = {};
      appSettings.update(false);
    }

    this.baseAPI = "https://api.wakatime.com/api/v1";
    this.agentName = "acode";
    this.acodeVersion = document.body.dataset.version.split(" ")[0];
    this.apiKey = "";
    this.lastHeartbeat = 0;
    this.heartbeatTimeout = 120000; // 2 minutes

    this.handleFileSwitch = this.handleFileSwitch.bind(this);
    this.handleEditorChange = this.handleEditorChange.bind(this);
  }

  async init() {
    sidebar.add(
      "check_circle_outline",
      "wakatime",
      "wakatime",
      null,
      null,
      this.showSettings.bind(this)
    );

    // Add event listener
    editorManager.on("switch-file", this.handleFileSwitch);
    editorManager.editor.on("change", this.handleEditorChange);
  }

  async destroy() {
    sidebar.remove("wakatime");

    // Clean up event listeners
    editorManager.off("switch-file", this.handleFileSwitch);
    editorManager.editor.off("change", this.handleEditorChange);
  }

  async showSettings() {
    const apiKey = await acode.prompt(
      "Enter WakaTime API Key",
      "text",
      this.apiKey || ""
    );

    if (apiKey) {
      this.apiKey = apiKey;
    }
  }

  async handleFileSwitch(file) {
    if (!file) return;
    await this.sendHeartbeat(file.filename, true);
  }

  async handleEditorChange(changes) {
    const file = editorManager.activeFile;
    if (!file) return;
    await this.sendHeartbeat(file.filename, false);
  }

  async sendHeartbeat(filename, isWrite) {
    if (!this.apiKey) return;

    const now = Date.now();
    if (now - this.lastHeartbeat < this.heartbeatTimeout) return;

    this.lastHeartbeat = now;

    const data = {
      entity: filename,
      type: "file",
      time: now / 1000,
      is_write: isWrite,
      plugin: this.getPlugin(),
      language: this.getFileLanguage(filename),
      project: this.getProjectName()
    };

    try {
      const response = await fetch(`${this.baseAPI}/users/current/heartbeats`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(this.apiKey)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        console.error(`WakaTime API error: ${response.status}`);
      }
    } catch (error) {
      console.error(error);
      // alert("WakaTime Error", error.message);
    }
  }

  getFileLanguage(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const mode = modeList.modes.find(m =>
      m.extensions.split("|").includes(ext)
    );
    return mode?.caption || "Unknown";
  }

  getProjectName() {
    return (
      acode.workspace?.name || window.addedFolder[0]?.title || "Unknown Project"
    );
  }

  getPlugin() {
    const agent = `${this.agentName}/${this.acodeVersion} ${plugin.name}/${plugin.version}`;
    const os = window.device.platform || null;
    return os ? `(${os}) ${agent}` : agent;
  }

  getSettingsList() {
    return [
      {
        key: "set_wakatime_api_key",
        text: "Set Wakatime api key",
        value: this.apiKey || ""
      }
    ];
  }

  onSettingsChange(key, value) {
    if (!value) return;
    this.apiKey = value;
  }
}

// Initialize plugin
if (window.acode) {
  const acodePlugin = new WakaTimePlugin();
  acode.setPluginInit(
    plugin.id,
    async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
      if (!baseUrl.endsWith("/")) baseUrl += "/";

      acodePlugin.baseUrl = baseUrl;
      await acodePlugin.init($page, cacheFile, cacheFileUrl);
    }
  );
  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}
