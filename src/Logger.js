export default {
  log(type, message, data) {
    const labelStyle = "color: #5A5A5A";
    const typeStyles = {
      SUCCESS: "color: #4ADE80",
      INFO: "color: #60A5FA",
      ERROR: "color: #F87171",
      WARNING: "color: #FBBF24",
    };

    const typeUpper = type.toUpperCase();
    const typeStyle = typeStyles[typeUpper] || "color: gray";
    const colon = message && data ? ":" : "";

    const logArgs = [`%c[Wakatime] %c[${typeUpper}]`, labelStyle, typeStyle];

    if (message) logArgs.push(message + colon);
    if (data) logArgs.push(data);
    console.log(...logArgs);
  },
  success(message, data) {
    this.log("SUCCESS", message, data);
  },
  info(message, data) {
    this.log("INFO", message, data);
  },
  error(message, data) {
    this.log("ERROR", message, data);
  },
  warning(message, data) {
    this.log("WARNING", message, data);
  },
};
