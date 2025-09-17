import plugin from "../plugin.json";
import { Wakatime } from "./Wakatime.js";

if (window.acode) {
  const mPlugin = new Wakatime();
  acode.setPluginInit(plugin.id, mPlugin.init.bind(mPlugin), mPlugin.pSettings);
  acode.setPluginUnmount(plugin.id, mPlugin.destroy.bind(mPlugin));
}
