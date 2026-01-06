import fetch from 'node-fetch';
import {
  Accessory,
  Categories,
  Service,
  Characteristic,
  uuid,
  HAPStorage
} from 'hap-nodejs';
import fs from 'fs';
import path from 'path';

// ----------------------------
// Persistent HomeKit storage
// ----------------------------
const persistPath = "/data/homekit";
if (!fs.existsSync(persistPath)) fs.mkdirSync(persistPath, { recursive: true });
HAPStorage.setCustomStoragePath(persistPath);

// ----------------------------
// Load HA add-on config
// ----------------------------
const optionsPath = "/data/options.json";
let config;

try {
  const raw = fs.readFileSync(optionsPath, "utf-8");
  config = JSON.parse(raw);

  if (!config.ha_url || !config.climate) {
    throw new Error("Missing required keys in options.json");
  }

  console.log("Loaded add-on config:", config);
} catch (err) {
  console.error("Failed to load add-on config:", err);
  process.exit(1);
}

const HA_URL = config.ha_url;
const TOKEN = config.token;
const CLIMATE = config.climate;
const NAME = config.name || "Air Conditioner";
const POLL_INTERVAL = config.poll_interval || 5000;

// ----------------------------
// HomeKit accessory setup
// ----------------------------
console.log("HomeKit Climate Wrapper Starting");

const accessoryUUID = uuid.generate("ha-homekit-climate-wrapper");
const accessory = new Accessory(NAME, accessoryUUID, Categories.THERMOSTAT);

// Accessory info
accessory.getService(Service.AccessoryInformation)
  .setCharacteristic(Characteristic.Manufacturer, "Home Assistant")
  .setCharacteristic(Characteristic.Model, "Climate Wrapper");

// Services
const thermostat = accessory.addService(Service.Thermostat, NAME);
const fan = accessory.addService(Service.Fanv2, "Fan Speed", "fan");
const eco = accessory.addService(Service.Switch, "Eco Mode", "eco");
const fanOnly = accessory.addService(Service.Switch, "Fan Only", "fan_only");

// ----------------------------
// Helper: call HA services
// ----------------------------
async function callHA(service, data) {
  try {
    await fetch(`${HA_URL}/api/services/${service}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error("Error calling HA service:", err);
  }
}

// ----------------------------
// Thermostat handlers
// ----------------------------
thermostat.getCharacteristic(Characteristic.TargetTemperature)
  .onSet(v => callHA("climate/set_temperature", { entity_id: CLIMATE, temperature: v }));

thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
  .onSet(v => {
    const map = ["off", "heat", "cool", "auto"];
    return callHA("climate/set_hvac_mode", { entity_id: CLIMATE, hvac_mode: map[v] });
  });

// ----------------------------
// Fan handlers (always active)
// ----------------------------
fan
  .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
  .setCharacteristic(Characteristic.TargetFanState, Characteristic.TargetFanState.MANUAL);

fan.getCharacteristic(Characteristic.RotationSpeed)
  .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
  .onSet(v => {
    let mode =
      v <= 16 ? "silent" :
        v <= 33 ? "low" :
          v <= 50 ? "medium" :
            v <= 66 ? "high" :
              v <= 83 ? "full" : "auto";

    return callHA("climate/set_fan_mode", { entity_id: CLIMATE, fan_mode: mode });
  });

// ----------------------------
// Eco switch
// ----------------------------
eco.getCharacteristic(Characteristic.On)
  .onSet(v => callHA("climate/set_preset_mode", { entity_id: CLIMATE, preset_mode: v ? "eco" : "none" }));

// ----------------------------
// Fan-only switch
// ----------------------------
fanOnly.getCharacteristic(Characteristic.On)
  .onSet(v => callHA("climate/set_hvac_mode", { entity_id: CLIMATE, hvac_mode: v ? "fan_only" : "off" }));

// ----------------------------
// Poll HA to update HomeKit
// ----------------------------
async function sync() {
  try {
    const res = await fetch(`${HA_URL}/api/states/${CLIMATE}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    const a = data.attributes;

    // Thermostat
    thermostat.updateCharacteristic(Characteristic.CurrentTemperature, a.current_temperature);
    thermostat.updateCharacteristic(Characteristic.TargetTemperature, a.temperature);
    const hvacMap = { off: 0, heat: 1, cool: 2, auto: 3, dry: 3 };
    thermostat.updateCharacteristic(Characteristic.TargetHeatingCoolingState, hvacMap[data.state] ?? 0);

    // Fan (always active)
    const revFan = { silent: 15, low: 30, medium: 45, high: 60, full: 75, auto: 100 };
    const fanMode = a.fan_mode ?? "auto";
    const speed = revFan[fanMode] ?? 100;

    fan.updateCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
    fan.updateCharacteristic(Characteristic.TargetFanState, Characteristic.TargetFanState.MANUAL);

    const fanIsRunning = data.state !== "off" || fanMode !== "auto";
    fan.updateCharacteristic(Characteristic.CurrentFanState,
      fanIsRunning ? Characteristic.CurrentFanState.BLOWING_AIR : Characteristic.CurrentFanState.IDLE);

    fan.updateCharacteristic(Characteristic.RotationSpeed, speed);

    // Eco & Fan Only
    eco.updateCharacteristic(Characteristic.On, a.preset_mode === "eco");
    fanOnly.updateCharacteristic(Characteristic.On, data.state === "fan_only");

  } catch (err) {
    console.error("Error syncing HA state:", err);
  }
}

setInterval(sync, POLL_INTERVAL);
sync();

// ----------------------------
// Publish HomeKit accessory
// ----------------------------
accessory.publish({
  username: "CC:22:3D:E3:CE:30",
  pincode: "031-45-154",
  port: 51826
});

console.log("HomeKit Climate Wrapper running");
