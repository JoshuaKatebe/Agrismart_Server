const DeviceControl = require('../models/DeviceControl');
const SensorData = require('../models/SensorData');
const moment = require('moment');

class FailsafeService {
  constructor(io) {
    this.io = io;
    this.offlineDevices = new Map();
    this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    this.offlineThreshold = 10 * 60 * 1000; // 10 minutes offline threshold
    
    // Start monitoring
    this.startMonitoring();
  }

  startMonitoring() {
    console.log('🛡️  Failsafe monitoring system started');
    
    // Check device status every 5 minutes
    setInterval(async () => {
      await this.checkDeviceStatus();
    }, this.checkInterval);
    
    // Initial check
    setTimeout(() => this.checkDeviceStatus(), 5000);
  }

  async checkDeviceStatus() {
    try {
      console.log('🔍 Checking device status...');
      
      const devices = await DeviceControl.find({})
        .populate('userId', 'username email preferences')
        .populate('greenhouseId', 'name location');

      for (const device of devices) {
        await this.evaluateDeviceStatus(device);
      }
      
    } catch (error) {
      console.error('❌ Error in failsafe monitoring:', error);
    }
  }

  async evaluateDeviceStatus(device) {
    const now = moment();
    const lastHeartbeat = moment(device.deviceStatus.lastHeartbeat);
    const offlineMinutes = now.diff(lastHeartbeat, 'minutes');
    
    const isOffline = offlineMinutes > 10; // 10 minutes threshold
    const wasOffline = this.offlineDevices.has(device.deviceId);
    
    if (isOffline && !wasOffline) {
      // Device just went offline
      await this.handleDeviceOffline(device, offlineMinutes);
      this.offlineDevices.set(device.deviceId, {
        offlineSince: lastHeartbeat.toDate(),
        notificationsSent: 0,
        failsafeActivated: false
      });
      
    } else if (isOffline && wasOffline) {
      // Device still offline - check if we need to escalate
      await this.handleContinuedOffline(device, offlineMinutes);
      
    } else if (!isOffline && wasOffline) {
      // Device came back online
      await this.handleDeviceOnline(device);
      this.offlineDevices.delete(device.deviceId);
    }
  }

  async handleDeviceOffline(device, offlineMinutes) {
    console.log(`⚠️  Device ${device.deviceId} went offline (${offlineMinutes} minutes)`);
    
    // Get latest sensor data to assess situation
    const latestSensorData = await SensorData.findOne({ deviceId: device.deviceId })
      .sort({ createdAt: -1 });
    
    // Send real-time notification
    this.io.emit(`greenhouse_${device.greenhouseId}`, {
      type: 'device_offline',
      deviceId: device.deviceId,
      severity: 'warning',
      message: `Device ${device.deviceId} has gone offline`,
      timestamp: new Date(),
      offlineMinutes
    });

    // Check if immediate failsafe action is needed
    if (latestSensorData) {
      await this.assessCriticalConditions(device, latestSensorData);
    }

    // Log the offline event
    device.controlHistory.push({
      action: 'device_offline',
      relay: 'system',
      previousState: true,
      newState: false,
      triggeredBy: 'alert',
      reason: `Device went offline after ${offlineMinutes} minutes of no communication`
    });

    await device.save();
  }

  async handleContinuedOffline(device, offlineMinutes) {
    const offlineInfo = this.offlineDevices.get(device.deviceId);
    
    // Escalate alerts every 30 minutes
    if (offlineMinutes % 30 === 0 && offlineInfo.notificationsSent < 5) {
      this.io.emit(`greenhouse_${device.greenhouseId}`, {
        type: 'device_offline_escalation',
        deviceId: device.deviceId,
        severity: offlineMinutes > 60 ? 'critical' : 'high',
        message: `Device ${device.deviceId} has been offline for ${offlineMinutes} minutes`,
        timestamp: new Date(),
        offlineMinutes
      });
      
      offlineInfo.notificationsSent++;
    }

    // Activate emergency failsafe after 1 hour if critical conditions detected
    if (offlineMinutes > 60 && !offlineInfo.failsafeActivated) {
      await this.activateEmergencyFailsafe(device);
      offlineInfo.failsafeActivated = true;
    }
  }

  async handleDeviceOnline(device) {
    console.log(`✅ Device ${device.deviceId} is back online`);
    
    const offlineInfo = this.offlineDevices.get(device.deviceId);
    const offlineDuration = moment().diff(moment(offlineInfo.offlineSince), 'minutes');
    
    // Send recovery notification
    this.io.emit(`greenhouse_${device.greenhouseId}`, {
      type: 'device_online',
      deviceId: device.deviceId,
      severity: 'info',
      message: `Device ${device.deviceId} is back online`,
      timestamp: new Date(),
      offlineDuration
    });

    // Reset any failsafe modes if device was offline
    if (offlineInfo.failsafeActivated) {
      await this.resetFailsafeMode(device);
    }

    // Log the recovery
    device.controlHistory.push({
      action: 'device_online',
      relay: 'system',
      previousState: false,
      newState: true,
      triggeredBy: 'alert',
      reason: `Device came back online after ${offlineDuration} minutes offline`
    });

    await device.save();
  }

  async assessCriticalConditions(device, sensorData) {
    const criticalActions = [];
    
    // Check for critical temperature (too high)
    if (sensorData.temperature.temp2.value > 35) { // Greenhouse temp > 35°C
      if (device.relays.ventilationFan) {
        device.relays.ventilationFan.state = true;
        device.relays.ventilationFan.mode = 'MANUAL';
        criticalActions.push('Emergency ventilation activated - high temperature');
      }
    }
    
    // Check for critically low soil moisture
    if (sensorData.soilMoisture.value < 20 && sensorData.waterTankLevel.value > 15) {
      if (device.relays.waterPump) {
        device.relays.waterPump.state = true;
        device.relays.waterPump.mode = 'MANUAL';
        criticalActions.push('Emergency irrigation activated - critically low soil moisture');
      }
    }
    
    // Check for critically low water tank
    if (sensorData.waterTankLevel.value < 10) {
      criticalActions.push('CRITICAL: Water tank level below 10% - manual refill required');
      
      // Send critical alert
      this.io.emit(`greenhouse_${device.greenhouseId}`, {
        type: 'critical_alert',
        deviceId: device.deviceId,
        severity: 'critical',
        message: 'Water tank critically low - immediate attention required',
        timestamp: new Date(),
        waterLevel: sensorData.waterTankLevel.value
      });
    }

    if (criticalActions.length > 0) {
      console.log(`🚨 Critical conditions detected for ${device.deviceId}:`, criticalActions);
      
      // Log critical actions
      device.controlHistory.push({
        action: 'critical_failsafe',
        relay: 'system',
        previousState: false,
        newState: true,
        triggeredBy: 'alert',
        reason: `Critical conditions: ${criticalActions.join(', ')}`
      });

      await device.save();
    }
  }

  async activateEmergencyFailsafe(device) {
    console.log(`🚨 Activating emergency failsafe for ${device.deviceId}`);
    
    const actions = [];
    
    // Activate water pump in manual mode (safe operation)
    if (device.relays.waterPump) {
      device.relays.waterPump.state = true;
      device.relays.waterPump.mode = 'MANUAL';
      actions.push('Water pump activated');
    }
    
    // Activate ventilation fan
    if (device.relays.ventilationFan) {
      device.relays.ventilationFan.state = true;
      device.relays.ventilationFan.mode = 'MANUAL';
      actions.push('Ventilation fan activated');
    }
    
    // Turn off fertilizer pump (safety)
    if (device.relays.fertilizerPump) {
      device.relays.fertilizerPump.state = false;
      actions.push('Fertilizer pump deactivated for safety');
    }

    // Send emergency notification
    this.io.emit(`greenhouse_${device.greenhouseId}`, {
      type: 'emergency_failsafe',
      deviceId: device.deviceId,
      severity: 'critical',
      message: 'Emergency failsafe activated - device offline for over 1 hour',
      timestamp: new Date(),
      actions
    });

    // Log failsafe activation
    device.controlHistory.push({
      action: 'emergency_failsafe',
      relay: 'system',
      previousState: false,
      newState: true,
      triggeredBy: 'alert',
      reason: 'Device offline for over 1 hour - emergency procedures activated'
    });

    await device.save();
  }

  async resetFailsafeMode(device) {
    console.log(`🔄 Resetting failsafe mode for ${device.deviceId}`);
    
    // Reset pumps back to AUTO mode
    if (device.relays.waterPump && device.relays.waterPump.mode === 'MANUAL') {
      device.relays.waterPump.mode = 'AUTO';
    }
    
    if (device.relays.ventilationFan && device.relays.ventilationFan.mode === 'MANUAL') {
      device.relays.ventilationFan.mode = 'AUTO';
    }

    // Add reset command to queue for when device reconnects
    device.commandQueue.push({
      command: 'esp32_command',
      parameters: {
        esp32Command: 'WATER:AUTO'
      },
      priority: 'high'
    });

    device.commandQueue.push({
      command: 'esp32_command',
      parameters: {
        esp32Command: 'FAN:AUTO'
      },
      priority: 'high'
    });

    device.controlHistory.push({
      action: 'failsafe_reset',
      relay: 'system',
      previousState: true,
      newState: false,
      triggeredBy: 'automation',
      reason: 'Device reconnected - resetting to automatic modes'
    });

    await device.save();
  }

  // Method to manually trigger failsafe for testing
  async manualFailsafeTest(deviceId, userId) {
    const device = await DeviceControl.findOne({ deviceId });
    if (!device) {
      throw new Error('Device not found');
    }

    await this.activateEmergencyFailsafe(device);
    
    return {
      success: true,
      message: 'Manual failsafe test completed',
      timestamp: new Date()
    };
  }

  // Get current offline devices status
  getOfflineDevicesStatus() {
    const status = [];
    
    for (const [deviceId, info] of this.offlineDevices.entries()) {
      status.push({
        deviceId,
        offlineSince: info.offlineSince,
        offlineDuration: moment().diff(moment(info.offlineSince), 'minutes'),
        notificationsSent: info.notificationsSent,
        failsafeActivated: info.failsafeActivated
      });
    }
    
    return status;
  }
}

module.exports = FailsafeService;
