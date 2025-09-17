import plugin from "../plugin.json";
import WakaAPI from "./Api.js";
import WakaOffline from "./Offline.js";
import WakaSidebar from "./Sidebar.js";
const appSettings = acode.require("settings");

export class Wakatime {
  activityStart = Date.now();
  constructor() {
    if (!appSettings.value[plugin.id]) {
      appSettings.value[plugin.id] = {
        saveData: false,
        endpointKey: WakaAPI.API_BASE_URL,
        apiKey: null,
      };
    }
  }

  async init(baseUrl, $page, { cacheFileUrl, cacheFile, firstInit }) {
    this.baseUrl = baseUrl;
    this.offline = new WakaOffline(this);
    this.api = new WakaAPI(this, this.offline);
    this.sidebar = new WakaSidebar(this);

    await this.sidebar.init();
    acode.define("wakatime", this.api);
    acode.define("@wakatime/offline", this.offline);
  }

  async destroy() {
    this.offline.destroy();
    this.api.destroy();
    this.sidebar.destroy();
    delete appSettings.value[plugin.id];
    appSettings.update(false);
    acode.define("wakatime", undefined);
    acode.define("@wakatime/offline", undefined);
  }

  get settings() {
    return appSettings.value[plugin.id];
  }

  get apiKey() {
    return appSettings.value[plugin.id]?.apiKey;
  }

  set apiKey(v) {
    appSettings.value[plugin.id].apiKey = v;
  }

  get endpointKey() {
    return appSettings.value[plugin.id]?.endpointKey;
  }

  set endpointKey(v) {
    appSettings.value[plugin.id].endpointKey = v;
  }

  get pSettings() {
    const API_KEY = "api_key";
    const ENDPOINT_KEY = "endpoint_key";
    const SAVE_QUEUE_AFTER_DESTROY = "save_queue_after_destroy";
    const CLEAR_QUEUE_DATA = "clear_queue_data";

    return {
      list: [
        {
          key: API_KEY,
          text: "Wakatime API Key",
          value: this.apiKey || "",
          prompt: "Wakatime API Key",
          promptType: "text",
          promptOptions: {
            required: true,
            placeholder: "waka_xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            test: WakaAPI.isApiKey,
          },
        },
        {
          key: ENDPOINT_KEY,
          text: "WakaTime API Endpoint",
          value: this.endpointKey || WakaAPI.API_BASE_URL,
          prompt: "Custom WakaTime API Endpoint",
          promptType: "text",
          promptOptions: {
            required: false,
            placeholder: WakaAPI.API_BASE_URL,
            test: WakaAPI.apiEndpointRegex,
          },
        },
        {
          key: SAVE_QUEUE_AFTER_DESTROY,
          text: "Save Queue data after destroy",
          checkbox: this.settings.saveData,
        },
        {
          key: CLEAR_QUEUE_DATA,
          text: "CLEAR Queue data",
        },
      ],
      cb: (key, value) => {
        switch (key) {
          case API_KEY:
            this.apiKey = value.trim();
            break;
          case ENDPOINT_KEY:
            this.endpointKey = value.trim();
            break;
          case SAVE_QUEUE_AFTER_DESTROY:
            this.settings.saveData = !this.settings.saveData;
            break;
          case CLEAR_QUEUE_DATA:
            this.api.queue.clear();
            this.offline.clear();
            break;
        }
        appSettings.update(false);
      },
    };
  }
}
