# HomeKit Climate Wrapper Add-on

This Home Assistant **add-on** exposes a *single combined HomeKit accessory*
(Thermostat + Fan speed + switches like Eco/Fan Only) similar to your Homebridge plugin,
but **without Homebridge**.

It runs a small Node.js HomeKit bridge **inside Home Assistant** and talks to HA via its API.

## What this does
- Single HomeKit accessory
- Thermostat service
- FanV2 service (mapped to fan_mode strings)
- Switches (Eco, Fan Only)
- Uses HA Long-Lived Access Token
- Polls HA state every 5 seconds

## Requirements
- Home Assistant OS / Supervised
- HomeKit **disabled** for the target climate entity (avoid duplicates)
- Long-Lived Access Token

## Install
1. Copy this folder to `/addons/ha-homekit-climate-wrapper`
2. Add repository in HA Add-on Store
3. Install → Configure → Start
