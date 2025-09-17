import Queue from "./Queue.js";

export default class WakaOffline extends Queue {
  static QUEUE_STORAGE_KEY = "wakatime_offline_queue";
  #callback = () => {};
  #ctx;
  #onConnectEvent;

  constructor(ctx) {
    super(WakaOffline.QUEUE_STORAGE_KEY, (batch) =>
      this.#callback(batch, false),
    );

    this.#ctx = ctx;
    this.#onConnectEvent = this.#onConnect.bind(this);
    window.addEventListener("online", this.#onConnectEvent);
  }

  set callback(v) {
    this.#callback = v;
  }

  get isConnected() {
    return window.navigator.onLine;
  }

  #onConnect() {
    super.scheduleProcessing();
  }

  async process() {
    if (!this.isConnected) {
      return { success: true, processed: 0, failed: 0 };
    }

    return await super.process();
  }

  destroy() {
    if (!this.#ctx.settings.saveData) super.clear();
    window.removeEventListener("online", this.#onConnectEvent);
  }
}
