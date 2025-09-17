import DOMPurify from "dompurify";
import SidebarStyle from "./Sidebar.style.js";

const SidebarApps = acode.require("sidebarapps");
const Url = acode.require("url");
const ActionStack = acode.require("actionStack");
const Select = acode.require("select");

// TODO: Better show/hide for warn
export default class WakaSidebar {
  static SIDEBAR_APP_ID = "wakatime";
  static SIDEBAR_APP_ICON = "wakatime";
  static SIDEBAR_APP_TITLE = "wakatime";
  static SIDEBAR_APP_ICON_PATH = "assets/wakatime.svg";
  static SIDEBAR_APP_PREPEND = false;
  static UPDATER_TIMEOUT = 1000;

  #ctx;
  #updater;
  constructor(ctx) {
    this.#ctx = ctx;
  }

  get app() {
    return SidebarApps.get(WakaSidebar.SIDEBAR_APP_ID);
  }

  async init() {
    acode.addIcon(
      WakaSidebar.SIDEBAR_APP_ICON,
      await acode.toInternalUrl(
        Url.join(this.#ctx.baseUrl, WakaSidebar.SIDEBAR_APP_ICON_PATH),
      ),
    );

    SidebarApps.add(
      WakaSidebar.SIDEBAR_APP_ICON,
      WakaSidebar.SIDEBAR_APP_ID,
      WakaSidebar.SIDEBAR_APP_TITLE,
      this.#onInit.bind(this),
      WakaSidebar.SIDEBAR_APP_PREPEND,
      this.#onSelect.bind(this),
    );

    document.head.append(SidebarStyle);
  }

  destroy() {
    clearInterval(this.#updater);
    SidebarStyle.remove();
    SidebarApps.remove(WakaSidebar.SIDEBAR_APP_ID);
  }

  formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 5) return "just now";

    const years = Math.floor(totalSeconds / (3600 * 24 * 365));
    const days = Math.floor((totalSeconds % (3600 * 24 * 365)) / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(" ");
  }

  #onInit(container) {
    container.classList.add("wakatime");
  }

  async #onSelect(container) {
    const html = `
		  <div class="waka-header">
		    <span class="icon wakatime"></span>
        <div class="waka-title">
          <span class="waka-title-text">Wakatime</span>
          <span class="waka-title-subtext">Track your coding activity</span>
        </div>
      </div>
      <div class="waka-warn">
        <span class="icon warningreport_problem"></span>
        <span class="waka-text"></span>
      </div>
      <div class="waka-body">
        <div class="waka-main status">
          <div class="waka-item connection" data-connection="${this.#ctx.offline.isConnected ? "on" : "off"}">
            <span class="waka-text">Connection</span>
            <span class="waka-icon"></span>
            <span class="waka-subtext"></span>
          </div>
          <div class="waka-item activity">
            <span class="waka-text">Activity</span>
            <span class="waka-subtext">${this.formatDuration(Date.now() - this.#ctx.activityStart)}</span>
          </div>
          <div class="waka-item api">
            <span class="waka-text">API Status</span>
            <div class="waka-subitem">
              <div class="waka-item apikey">
                <span class="waka-text">APi Key</span>
                <span class="waka-subtext">${this.#ctx.apiKey ? "Authorized" : "none"}</span>
              </div>
              <div class="waka-item endpoint">
                <span class="waka-text">Endpoint</span>
                <span class="waka-subtext">${this.#ctx.endpointKey || "none"}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="waka-main heartbeat">
          <div class="waka-item total">
            <span class="waka-text">Total Heartbeats</span>
            <span class="waka-subtext">${this.#ctx.api.totalHeartbeats}</span>
          </div>
          <div class="waka-item last">
            <span class="waka-text">Last Heartbeat</span>
            <div class="waka-subitem">
              <div class="waka-item _file">
                <span class="waka-text">File</span>
                <span class="waka-subtext">${Url.basename(this.#ctx.api.lastHeartbeat.fileUri || "none")}</span>
              </div>
              <div class="waka-item proj">
                <span class="waka-text">Project</span>
                <span class="waka-subtext">${this.#ctx.api.lastHeartbeat.project || "none"}</span>
              </div>
              <div class="waka-item time">
                <span class="waka-text">Time</span>
                <span class="waka-subtext">${this.#ctx.api.lastHeartbeat.timestamp === 0 ? "none" : this.formatDuration(Date.now() - this.#ctx.api.lastHeartbeat.timestamp)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="waka-main queue">
          <div class="waka-item">
            <span class="waka-text">Queue</span>
            <div class="waka-subitem type-square">
              <div class="waka-item online">
                <span class="waka-text">${this.#ctx.api.queue.length}</span>
                <span class="waka-subtext">online</span>
              </div>
              <div class="waka-item offline">
                <span class="waka-text">${this.#ctx.offline.length}</span>
                <span class="waka-subtext">offline</span>
              </div>
            </div>
          </div>
        </div>
        <div class="waka-main heartbeat-data">
          <div class="waka-item category">
            <span class="waka-text">Category</span>
            <div class="waka-subitem type-select">
              <span class="waka-subtext">${this.#ctx.api.category}</span>
              <span class="icon keyboard_arrow_down"></span>
            </div>
          </div>
        </div>
        <div class="waka-main current-file" data-isfile="${!!editorManager?.activeFile?.session}">
          <div class="waka-item">
            <span class="waka-text"></span>
            <div class="waka-subitem">
              <div class="waka-item filename">
                <span class="waka-text">Name</span>
                <span class="waka-subtext">${Url.basename(editorManager?.activeFile?.uri || "none")}</span>
              </div>
              <div class="waka-item filelang">
                <span class="waka-text">Language</span>
                <span class="waka-subtext">${this.#ctx.api.getFileLanguage(editorManager?.activeFile) || "none"}</span>
              </div>
              <div class="waka-item fileproj">
                <span class="waka-text">Project</span>
                <span class="waka-subtext">${this.#ctx.api.getProjectName(editorManager?.activeFile) || "none"}</span>
              </div>
              <div class="waka-item filebranch">
                <span class="waka-text">Branch</span>
                <span class="waka-subtext">${(await this.#ctx.api.getBranch(editorManager?.activeFile)) || "none"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    container.innerHTML = DOMPurify.sanitize(html);
    await this.#setUpdater(container);
    await this.#setEvents(container);
  }

  async #setUpdater(container) {
    this.#updater = await setInterval(async () => {
      if (localStorage.getItem("sidebarShown") === "0") return;
      if (
        localStorage.getItem("sidebarAppsLastSection") !==
        WakaSidebar.SIDEBAR_APP_ID
      )
        clearInterval(this.#updater);

      const $wakaWarn = container.querySelector(".waka-warn");
      const $wakaWarnText = container.querySelector(".waka-warn > .waka-text");
      const $wakaConnection = container.querySelector(".waka-item.connection");
      const $wakaActivity = container.querySelector(
        ".waka-item.activity > .waka-subtext",
      );
      const $wakaApiKey = container.querySelector(
        ".waka-item.apikey > .waka-subtext",
      );
      const $wakaEndpoint = container.querySelector(
        ".waka-item.endpoint > .waka-subtext",
      );
      const $wakaTotalHeartbeats = container.querySelector(
        ".waka-item.total > .waka-subtext",
      );
      const $wakaLastHeartbeatFile = container.querySelector(
        ".waka-item._file > .waka-subtext",
      );
      const $wakaLastHeartbeatProject = container.querySelector(
        ".waka-item.proj > .waka-subtext",
      );
      const $wakaLastHeartbeatTimestamp = container.querySelector(
        ".waka-item.time > .waka-subtext",
      );
      const $wakaQueueOnline = container.querySelector(
        ".waka-item.online > .waka-text",
      );
      const $wakaQueueOffline = container.querySelector(
        ".waka-item.offline > .waka-text",
      );
      const $wakaCategory = container.querySelector(
        ".waka-item.category > .waka-subitem > .waka-subtext",
      );
      const $wakaCurrentFile = container.querySelector(
        ".waka-main.current-file",
      );
      const $wakaCurrentFileName = container.querySelector(
        ".waka-item.filename > .waka-subtext",
      );
      const $wakaCurrentFileLang = container.querySelector(
        ".waka-item.filelang > .waka-subtext",
      );
      const $wakaCurrentFileProj = container.querySelector(
        ".waka-item.fileproj > .waka-subtext",
      );
      const $wakaCurrentFileBranch = container.querySelector(
        ".waka-item.filebranch > .waka-subtext",
      );

      // warn
      if (!this.#ctx.apiKey) {
        $wakaWarn.classList.add("show");
        $wakaWarnText.innerHTML = "Not authorized, missing api-key.";
      } else if ($wakaWarn.classList.contains("show")) {
        $wakaWarn.classList.remove("show");
      }

      // items
      $wakaConnection.setAttribute(
        "data-connection",
        this.#ctx.offline.isConnected ? "on" : "off",
      );
      $wakaActivity.innerHTML = this.formatDuration(
        Date.now() - this.#ctx.activityStart,
      );

      $wakaApiKey.innerHTML = this.#ctx.apiKey ? "Authorized" : "none";
      $wakaEndpoint.innerHTML = this.#ctx.endpointKey || "none";

      $wakaTotalHeartbeats.innerHTML = this.#ctx.api.totalHeartbeats;

      $wakaLastHeartbeatFile.innerHTML = Url.basename(
        this.#ctx.api.lastHeartbeat.fileUri || "none",
      );
      $wakaLastHeartbeatProject.innerHTML =
        this.#ctx.api.lastHeartbeat.project || "none";
      $wakaLastHeartbeatTimestamp.innerHTML =
        this.#ctx.api.lastHeartbeat.timestamp === 0
          ? "none"
          : this.formatDuration(
              Date.now() - this.#ctx.api.lastHeartbeat.timestamp,
            );

      $wakaQueueOnline.innerHTML = this.#ctx.api.queue.length;
      $wakaQueueOffline.innerHTML = this.#ctx.offline.length;

      $wakaCategory.innerHTML = this.#ctx.api.category;

      $wakaCurrentFile.setAttribute(
        "data-isfile",
        !!editorManager?.activeFile?.session,
      );
      $wakaCurrentFileName.innerHTML = Url.basename(
        editorManager?.activeFile?.uri || "none",
      );
      $wakaCurrentFileLang.innerHTML =
        this.#ctx.api.getFileLanguage(editorManager?.activeFile) || "none";
      $wakaCurrentFileProj.innerHTML =
        this.#ctx.api.getProjectName(editorManager?.activeFile) || "none";
      $wakaCurrentFileBranch.innerHTML =
        (await this.#ctx.api.getBranch(editorManager?.activeFile)) || "none";
    }, WakaSidebar.UPDATER_TIMEOUT);
  }

  async #setEvents(container) {
    const $wakaCategory = container.querySelector(
      ".waka-item.category > .waka-subitem",
    );

    $wakaCategory.addEventListener("click", async () => {
      const value = await Select(
        "Heartbeats Category",
        this.#ctx.api.constructor.CATEGORY_TYPES,
      );
      this.#ctx.api.category = value;
    });
  }
}
