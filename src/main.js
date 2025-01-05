import plugin from "../plugin.json";
import * as Utils from "./utils.js";

const sidebar = acode.require("sidebarApps");

// constants
const API_BASE_URL = "https://api.wakatime.com/api/v1";
const HEARTBEAT_TIMEOUT = 120000; // 2 minutes

class WakaTimePlugin {
  constructor() {
    this.apiKey = "";
    this.lastHeartbeat = {
      time: 0,
      file: null,
      project: null
    };

    this.handleFileSwitch = this.handleFileSwitch.bind(this);
    this.handleEditorChange = this.handleEditorChange.bind(this);

    acode.addIcon(
      "wakatime",
      "https://raw.githubusercontent.com/NezitX/acode-wakatime/refs/heads/main/assets/wakatime.svg"
    );
  }

  async init() {
    sidebar.add(
      "wakatime",
      "wakatime",
      "wakatime",
      null,
      null,
      this.onSidebarSelect.bind(this)
    );

    this.$style = document.createElement("style");
    this.$style.id = "wakatime";
    this.$style.innerHTML = `
      .icon.wakatime {
        background-color: currentcolor !important;
        -webkit-mask: url('https://raw.githubusercontent.com/NezitX/acode-wakatime/refs/heads/main/assets/wakatime.svg') no-repeat center;
        mask: url('https://raw.githubusercontent.com/NezitX/acode-wakatime/refs/heads/main/assets/wakatime.svg') no-repeat center;
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-size: 50%;
        mask-size: 50%;
      }
    `;
    document.head.append(this.$style);

    // Add event listener
    editorManager.on("switch-file", this.handleFileSwitch);
    editorManager.editor.on("change", this.handleEditorChange);
  }

  async destroy() {
    sidebar.remove("wakatime");
    this.$style.remove();

    // Clean up event listeners
    editorManager.off("switch-file", this.handleFileSwitch);
    editorManager.editor.off("change", this.handleEditorChange);
  }

  async onSidebarSelect(el) {
    if (!this.apiKey) await this.promptApiKey();
    el.innerHTML = `Your API is: \n${this.apiKey}`;
  }

  async promptApiKey() {
    const apiKey = await acode.prompt(
      "Enter WakaTime API Key",
      this.apiKey || "",
      "text",
      {
        required: true,
        placeholder: "Your Wakatime API",
        test: Utils.apiKeyValid
      }
    );

    if (apiKey) {
      this.apiKey = apiKey;
    }
  }

  isValidFile(file) {
    if (!file || window.addedFolder.length === 0) return false;
    return window.addedFolder.some(dir => file.uri?.includes(dir.url));
  }

  async handleFileSwitch(file) {
    if (!this.isValidFile(file))
      return console.warn("[WakaTime] not vaild file");
    await this.sendHeartbeat(file, true);
  }

  async handleEditorChange(changes) {
    const file = editorManager.activeFile;
    if (!this.isValidFile(file))
      return console.warn("[WakaTime] not vaild file");

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
    if (!this.apiKey) return console.warn("[WakaTime] apiKey not found");

    const now = Date.now();
    const fileuri = file.uri;
    const project = this.getProjectName(file);

    if (this.isDuplicateHeartbeat(fileuri, project, now))
      return console.warn("[WakaTime] Skipping duplicate heartbeat");

    this.lastHeartbeat = {
      time: now,
      file: fileuri,
      project
    };

    const data = {
      entity: file.filename,
      type: "file",
      time: now / 1000,
      is_write: isWrite,
      plugin: this.getPlugin(),
      language: this.getFileLanguage(file),
      project
    };

    try {
      const response = await fetch(`${API_BASE_URL}/users/current/heartbeats`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(this.apiKey)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        console.error(`WakaTime API error: ${response.status}`);
      } else {
        console.log(
          "[Wakatime] send heartbeat successfully, response: ",
          await response.json()
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
    const folder = window.addedFolder.find(dir => file.uri.includes(dir.url));
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
