export default class Queue {
  static BATCH_SIZE = 25;

  #queue = [];
  #isProcessing = false;
  #timer = null;
  #storageKey;
  #saveCallback;
  #processDelay;
  #saveTimer = null;
  #needsSave = false;

  constructor(storageKey, saveCallback, processDelay = 500) {
    this.#storageKey = storageKey;
    this.#saveCallback = saveCallback;
    this.#processDelay = processDelay;

    this.restore();
  }

  /**
   * Add an update to the queue
   * @param {Object} data - The data to queue for saving
   */
  add(data, timestamp) {
    this.#queue.push({
      data,
      timestamp: timestamp || Date.now(),
    });

    this.#scheduleSave();
    this.scheduleProcessing();
  }

  /**
   * Schedule queue processing with debouncing
   */
  scheduleProcessing() {
    if (this.#timer) {
      clearTimeout(this.#timer);
    }

    this.#timer = setTimeout(() => {
      this.process();
    }, this.#processDelay);
  }

  /**
   * Process the queue and save the latest update
   */
  async process() {
    if (this.#isProcessing || this.#queue.length === 0) {
      return { success: true, processed: 0 };
    }

    this.#isProcessing = true;
    let processedCount = 0;
    let failedCount = 0;

    while (this.#queue.length !== 0) {
      const batchSize = Math.min(Queue.BATCH_SIZE, this.#queue.length);
      const batch = this.#queue.splice(0, batchSize);

      try {
        await this.#saveCallback(batch);
        processedCount += batch.length;
      } catch (e) {
        failedCount += batch.length;
        // TODO: Handle failed heartbeats
      }

      if (this.#queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    window?.DEBUG &&
      console.log(
        `[WAKATIME:QUEUE] Processed ${processedCount} updates ${failedCount > 0 ? `(${failedCount} failed)` : ""}`,
      );
    this.#isProcessing = false;
    return { success: true, processed: processedCount, failed: failedCount };
  }

  /**
   * Clear the queue and remove from storage
   */
  clear() {
    this.#queue = [];
    this.#clearStorage();

    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
  }

  /**
   * Restore queue from localStorage
   * @returns {number} Number of items restored
   */
  restore() {
    try {
      const storedData = localStorage.getItem(this.#storageKey);
      if (storedData) {
        const restoredQueue = JSON.parse(storedData);
        if (Array.isArray(restoredQueue)) {
          this.#queue = restoredQueue;
          window?.DEBUG &&
            console.log(
              `[WAKATIME:QUEUE] Restored ${this.#queue.length} queued updates`,
            );

          return this.#queue.length;
        }
      }
    } catch (error) {
      window?.DEBUG &&
        console.warn("[WAKATIME:QUEUE] Failed to restore queue:", error);
      this.#queue = [];
    }

    return 0;
  }

  /**
   * Batched localStorage save to improve performance
   */
  #scheduleSave() {
    this.#needsSave = true;
    if (this.#saveTimer) return;

    this.#saveTimer = setTimeout(() => {
      if (this.#needsSave) {
        this.#saveToStorage();
        this.#needsSave = false;
      }
      this.#saveTimer = null;
    }, 100); // Batch saves within 100ms
  }

  /**
   * Save queue to localStorage
   */
  #saveToStorage() {
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify(this.#queue));
    } catch (error) {
      window?.DEBUG &&
        console.warn(
          "[WAKATIME:QUEUE] Failed to save queue to localStorage:",
          error,
        );
    }
  }

  /**
   * Remove queue from localStorage
   */
  #clearStorage() {
    try {
      localStorage.removeItem(this.#storageKey);
    } catch (error) {
      window?.DEBUG &&
        console.warn(
          "[WAKATIME:QUEUE] Failed to clear queue from localStorage:",
          error,
        );
    }
  }

  /**
   * Get queue status information
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      queueLength: this.#queue.length,
      isProcessing: this.#isProcessing,
      hasTimer: this.#timer !== null,
      oldestItem: this.#queue.length > 0 ? this.#queue[0].timestamp : null,
      newestItem:
        this.#queue.length > 0
          ? this.#queue[this.#queue.length - 1].timestamp
          : null,
    };
  }

  /**
   * Force immediate processing of the queue
   * @returns {Promise} Processing result
   */
  async forceProcess() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    return await this.process();
  }

  /**
   * Get the number of items in queue
   * @returns {number} Queue length
   */
  get length() {
    return this.#queue.length;
  }

  /**
   * Check if queue is empty
   * @returns {boolean} True if queue is empty
   */
  get isEmpty() {
    return this.#queue.length === 0;
  }

  /**
   * Check if queue is currently processing
   * @returns {boolean} True if processing
   */
  get isProcessing() {
    return this.#isProcessing;
  }
}
