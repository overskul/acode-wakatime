import plugin from "../plugin.json";
import WakaLogger from "./Logger.js";
import Queue from "./Queue.js";

const Fs = acode.require("fs");
const Url = acode.require("url");

// TODO: Save heartbeat's in Queue even if no ApiKey
// And send them all when the ApiKey is exist.
export default class WakaAPI {
  static QUEUE_STORAGE_KEY = "wakatime_heartbeat_queue";
  static API_BASE_URL = "https://api.wakatime.com/api/v1";
  static HEARTBEAT_TIMEOUT = 120000; // 2 minutes
  static HEARTBEAT_WRITE_TIMEOUT = 30000; // 30 seconds
  static EDITOR_CHANGE_DEBOUNCE = 2000; // 2 seconds
  static CATEGORY_TYPES = [
    "coding",
    "building",
    "indexing",
    "debugging",
    "browsing",
    "running tests",
    "writing tests",
    "manual testing",
    "writing docs",
    "code reviewing",
    "communicating",
    "notes",
    "researching",
    "learning",
    "designing",
    "ai coding",
  ];

  #ctx;
  #offlineStorage;
  #queue;
  #editorChangeTimer = null;
  #lastHeartbeat = {
    fileUri: null,
    project: null,
    timestamp: 0,
  };
  #handleFileSwitchEvent;
  #handleEditorChangeEvent;
  #category = WakaAPI.CATEGORY_TYPES[0];
  totalHeartbeats = 0;

  constructor(ctx, offlineStorage) {
    this.#ctx = ctx;
    this.#offlineStorage = offlineStorage;

    this.#offlineStorage.callback = this.#sendHeartbeat.bind(this);
    this.#queue = new Queue(
      WakaAPI.QUEUE_STORAGE_KEY,
      this.#sendHeartbeat.bind(this),
    );

    this.#handleFileSwitchEvent = this.#handleFileSwitch.bind(this);
    this.#handleEditorChangeEvent = this.#handleEditorChange.bind(this);

    editorManager.on("switch-file", this.#handleFileSwitchEvent);
    editorManager.editor.on("change", this.#handleEditorChangeEvent);
    this.#offlineStorage.scheduleProcessing();
  }

  get lastHeartbeat() {
    return this.#lastHeartbeat;
  }

  get queue() {
    return this.#queue;
  }

  get apiBaseUrl() {
    return this.#ctx.endpointKey ?? WakaAPI.API_BASE_URL;
  }

  get category() {
    return this.#category;
  }

  set category(v) {
    if (WakaAPI.CATEGORY_TYPES.indexOf(v.toLowerCase()) !== -1) {
      this.#category = v.toLowerCase();
    }
  }

  async #handleFileSwitch(file) {
    if (!this.isValidFile(file)) return;
    if (this.#editorChangeTimer) {
      clearTimeout(this.#editorChangeTimer);
      this.#editorChangeTimer = null;
    }
    await this.#addHeartbeat(file, false);
  }

  async #handleEditorChange(changes) {
    const file = editorManager.activeFile;
    if (!this.isValidFile(file)) return;
    if (this.#editorChangeTimer) clearTimeout(this.#editorChangeTimer);
    this.#editorChangeTimer = setTimeout(() => {
      this.#addHeartbeat(file, true);
      this.#editorChangeTimer = null;
    }, WakaAPI.EDITOR_CHANGE_DEBOUNCE);
  }

  #addHeartbeat(file, isWrite) {
    if (!this.#ctx.apiKey) return;
    const project = this.getProjectName(file);
    const timestamp = Date.now();
    if (this.isDuplicateHeartbeat(file.uri, isWrite, project, timestamp))
      return;
    const pos = file.session.selection.getCursor();
    this.#queue.add(
      {
        file: {
          uri: file.uri,
          lines: file.session.getLength(),
          line: pos.row + 1,
          cursorpos: pos.column + 1,
          language: this.getFileLanguage(file),
        },
        project,
        isWrite,
      },
      timestamp,
    );
    this.#offlineStorage.scheduleProcessing();
  }

  async #sendHeartbeat(batch, offline = true) {
    batch = Array.isArray(batch) ? batch : [batch];
    const heartbeats = await Promise.all(
      batch.map(async ({ data, timestamp }) => ({
        entity: data.file.uri,
        type: "file",
        category: this.category,
        time: Math.floor(timestamp / 1000),
        is_write: data.isWrite,
        plugin: this.getPlugin(),
        language: data.file.language,
        lines: data.file.lines,
        lineno: data.file.line,
        cursorpos: data.file.cursorpos,
        project: data.project,
        branch: await this.getBranch(data.file),
        machine: this.getMachineName(),
        user_agent: this.getUserAgent(),
        // TDOD
        alternate_language: null,
        alternate_project: null,
        dependencies: null,
      })),
    );

    const lastHeartbeat = batch[batch.length - 1];
    this.#lastHeartbeat = {
      fileUri: lastHeartbeat.data.file.uri,
      project: lastHeartbeat.data.project,
      timestamp: lastHeartbeat.timestamp,
    };

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/users/current/heartbeats.bulk`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(this.#ctx.apiKey)}`,
            "Content-Type": "application/json",
            "User-Agent": this.getPlugin(),
          },
          body: JSON.stringify(heartbeats),
        },
      );
      if (!response.ok) {
        if (!this.#offlineStorage.isConnected && offline) {
          batch.forEach(({ data, timestamp }) =>
            this.#offlineStorage.add(data, timestamp),
          );
        }
        throw new Error(`API Error, status: ${response.status}`);
      }

      this.totalHeartbeats += heartbeats.length;
      WakaLogger.success(
        `(${heartbeats.length}) Heartbeats`,
        (await response.json())?.responses,
      );
    } catch (error) {
      WakaLogger.error(null, error);
      if (!this.#offlineStorage.isConnected && offline) {
        batch.forEach(({ data, timestamp }) =>
          this.#offlineStorage.add(data, timestamp),
        );
      }
      throw error;
    }
  }

  isValidFile(file) {
    return (
      file && window.addedFolder.some((dir) => file.uri?.includes(dir.url))
    );
  }

  isDuplicateHeartbeat(fileUri, isWrite, project, timestamp) {
    if (!this.lastHeartbeat.fileUri) return false;

    const timeDiff = timestamp - this.lastHeartbeat.timestamp;
    if (isWrite && timeDiff > WakaAPI.HEARTBEAT_WRITE_TIMEOUT) return false;

    return (
      this.lastHeartbeat.fileUri === fileUri &&
      this.lastHeartbeat.project === project &&
      timeDiff < WakaAPI.HEARTBEAT_TIMEOUT
    );
  }

  getProjectName(file) {
    const folder = window.addedFolder.find((dir) =>
      file?.uri?.includes(dir.url),
    );
    if (!folder) return;
    return folder?.title;
  }

  getPlugin() {
    const agent = `${this.getAgentName()}/${this.getAppVersion()} acode-wakatime/${plugin.version}`;
    const os = window.device?.platform || null;
    return os ? `(${os}) ${agent}` : agent;
  }

  getAgentName() {
    return window.BuildInfo?.displayName || "Acode";
  }

  getMachineName() {
    return (
      window.device?.model || window.device?.platform || navigator?.platform
    );
  }

  getUserAgent() {
    return navigator.userAgent;
  }

  getAppVersion() {
    return (
      window.BuildInfo?.version ||
      document.body?.dataset?.version?.split(" ")[0] ||
      "0.0.0 (unknown)"
    );
  }

  getFileLanguage(file) {
    return file?.session?.$modeId?.split("/")?.pop();
  }

  async getBranch(file) {
    try {
      const root = window.addedFolder.find((dir) =>
        file?.uri?.includes(dir.url),
      );
      if (!root) return null;

      const head = await Fs(Url.join(root.url, ".git/HEAD")).readFile("utf8");
      const headContent = head.trim();

      if (headContent.startsWith("ref: refs/heads/")) {
        return headContent.replace("ref: refs/heads/", "");
      } else if (headContent.startsWith("ref:")) {
        return headContent?.split("/")?.pop();
      } else {
        return headContent?.substring(0, 7);
      }
    } catch (e) {
      WakaLogger.error("Failed to get branch name", e);
      return null;
    }
  }

  destroy() {
    if (this.#editorChangeTimer) {
      clearTimeout(this.#editorChangeTimer);
      this.#editorChangeTimer = null;
    }
    editorManager.off("switch-file", this.#handleFileSwitchEvent);
    editorManager.editor.off("change", this.#handleEditorChangeEvent);
    if (!this.#ctx.settings.saveData) this.#queue.clear();
  }

  static isApiKey(key) {
    const regex =
      /^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
    return !(!key || !regex.test(key));
  }

  static apiEndpointRegex(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return false;
      if (!url.hostname) return false;
      return true;
    } catch {
      return false;
    }
  }
}
