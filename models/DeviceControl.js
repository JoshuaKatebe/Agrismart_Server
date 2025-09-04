const mongoose = require('mongoose');

const deviceControlSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true,
    index: true
  },
  greenhouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Greenhouse',
    required: [true, 'Greenhouse ID is required']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  
  // Relay control states
  relays: {
    // Enhanced Water Pump (with auto/manual modes)
    waterPump: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Main Water Pump' },
      pin: { type: Number, default: 4 },
      mode: { 
        type: String, 
        enum: ['AUTO', 'MANUAL'], 
        default: 'AUTO' 
      },
      lastToggled: Date,
      lastHeartbeat: Date,
      totalRuntime: { type: Number, default: 0 }, // in seconds
      autoThresholds: {
        soilMoistureMin: { type: Number, default: 50 },
        waterTankMin: { type: Number, default: 20 }
      }
    },
    
    // Ventilation Fan (with auto/manual modes)
    ventilationFan: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Ventilation Fan' },
      pin: { type: Number, default: 8 },
      mode: { 
        type: String, 
        enum: ['AUTO', 'MANUAL'], 
        default: 'AUTO' 
      },
      lastToggled: Date,
      lastHeartbeat: Date,
      totalRuntime: { type: Number, default: 0 },
      autoThresholds: {
        temperatureMax: { type: Number, default: 30 }
      }
    },
    
    // Fertilizer Pump (manual only)
    fertilizerPump: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Fertilizer Pump' },
      pin: { type: Number, default: 7 },
      mode: { type: String, default: 'MANUAL' },
      lastToggled: Date,
      lastHeartbeat: Date,
      totalRuntime: { type: Number, default: 0 }
    },
    
    // Legacy pumps for backward compatibility
    waterPump1: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Legacy Water Pump 1' },
      pin: { type: Number, default: 2 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    },
    waterPump2: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Legacy Water Pump 2' },
      pin: { type: Number, default: 3 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    },
    
    // Lighting systems
    growLight1: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Main Grow Light' },
      pin: { type: Number, default: 5 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true },
      schedule: {
        enabled: { type: Boolean, default: false },
        onTime: { type: String, default: '06:00' },
        offTime: { type: String, default: '18:00' }
      }
    },
    growLight2: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Secondary Grow Light' },
      pin: { type: Number, default: 18 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true },
      schedule: {
        enabled: { type: Boolean, default: false },
        onTime: { type: String, default: '06:00' },
        offTime: { type: String, default: '18:00' }
      }
    },
    
    // Legacy ventilation fans
    exhaustFan: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Exhaust Fan' },
      pin: { type: Number, default: 19 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    },
    intakeFan: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Intake Fan' },
      pin: { type: Number, default: 21 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    },
    
    // Legacy nutrient pump
    nutrientPump: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Nutrient Pump' },
      pin: { type: Number, default: 22 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    },
    
    // Heater/Cooler
    heater: {
      state: { type: Boolean, default: false },
      name: { type: String, default: 'Heater' },
      pin: { type: Number, default: 23 },
      lastToggled: Date,
      totalRuntime: { type: Number, default: 0 },
      autoMode: { type: Boolean, default: true }
    }
  },
  
  // Automation rules
  automationRules: {
    irrigation: {
      enabled: { type: Boolean, default: true },
      soilMoistureThreshold: { type: Number, default: 30 },
      pumpDuration: { type: Number, default: 300 }, // seconds
      cooldownPeriod: { type: Number, default: 1800 }, // seconds between waterings
      lastTriggered: Date
    },
    lighting: {
      enabled: { type: Boolean, default: true },
      lightIntensityThreshold: { type: Number, default: 40 }, // below this, lights turn on
      schedule: {
        enabled: { type: Boolean, default: false },
        dailyHours: { type: Number, default: 12 },
        startTime: { type: String, default: '06:00' }
      }
    },
    ventilation: {
      enabled: { type: Boolean, default: true },
      temperatureThreshold: { type: Number, default: 28 },
      humidityThreshold: { type: Number, default: 75 },
      fanDuration: { type: Number, default: 600 } // seconds
    },
    climate: {
      enabled: { type: Boolean, default: true },
      targetTemperatureMin: { type: Number, default: 20 },
      targetTemperatureMax: { type: Number, default: 26 },
      hysteresis: { type: Number, default: 1 } // temperature buffer
    }
  },
  
  // Manual overrides
  manualOverrides: {
    active: { type: Boolean, default: false },
    duration: { type: Number, default: 3600 }, // seconds
    startTime: Date,
    reason: String,
    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Device status and health
  deviceStatus: {
    online: { type: Boolean, default: false },
    lastHeartbeat: { type: Date, default: Date.now },
    batteryLevel: Number,
    wifiSignal: Number,
    uptime: Number,
    freeMemory: Number,
    temperature: Number, // ESP32 internal temperature
    errors: [String]
  },
  
  // Command queue for ESP32
  commandQueue: [{
    command: {
      type: String,
      enum: ['toggle_relay', 'set_relay', 'get_status', 'restart', 'update_config']
    },
    parameters: mongoose.Schema.Types.Mixed,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'acknowledged', 'failed'],
      default: 'pending'
    },
    createdAt: { type: Date, default: Date.now },
    sentAt: Date,
    acknowledgedAt: Date,
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 }
  }],
  
  // Control history
  controlHistory: [{
    action: String,
    relay: String,
    previousState: Boolean,
    newState: Boolean,
    triggeredBy: {
      type: String,
      enum: ['manual', 'automation', 'schedule', 'alert'],
      default: 'manual'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: { type: Date, default: Date.now },
    reason: String
  }]
}, {
  timestamps: true
});

// Indexes
deviceControlSchema.index({ deviceId: 1 });
deviceControlSchema.index({ greenhouseId: 1 });
deviceControlSchema.index({ userId: 1 });
deviceControlSchema.index({ 'deviceStatus.online': 1 });
deviceControlSchema.index({ 'commandQueue.status': 1 });

// Static method to get current device states
deviceControlSchema.statics.getCurrentStates = function(deviceId) {
  return this.findOne({ deviceId }).select('relays deviceStatus');
};

// Instance method to toggle relay
deviceControlSchema.methods.toggleRelay = function(relayName, userId, reason = 'Manual toggle') {
  if (!this.relays[relayName]) {
    throw new Error(`Relay ${relayName} not found`);
  }
  
  const previousState = this.relays[relayName].state;
  const newState = !previousState;
  
  this.relays[relayName].state = newState;
  this.relays[relayName].lastToggled = new Date();
  
  // Add to history
  this.controlHistory.push({
    action: `toggle_${relayName}`,
    relay: relayName,
    previousState,
    newState,
    triggeredBy: 'manual',
    userId,
    reason
  });
  
  // Add to command queue
  this.commandQueue.push({
    command: 'set_relay',
    parameters: {
      relay: relayName,
      state: newState,
      pin: this.relays[relayName].pin
    },
    priority: 'high'
  });
  
  return this.save();
};

// Instance method to set relay state (Enhanced for new ESP32 system)
deviceControlSchema.methods.setRelay = function(relayName, state, triggeredBy = 'manual', userId = null, reason = '') {
  if (!this.relays[relayName]) {
    throw new Error(`Relay ${relayName} not found`);
  }
  
  const previousState = this.relays[relayName].state;
  const previousMode = this.relays[relayName].mode;
  
  if (previousState !== state) {
    this.relays[relayName].state = state;
    this.relays[relayName].lastToggled = new Date();
    
    // Add to history
    this.controlHistory.push({
      action: `set_${relayName}`,
      relay: relayName,
      previousState,
      newState: state,
      triggeredBy,
      userId,
      reason
    });
    
    // Generate ESP32 command based on relay type and current mode
    let esp32Command = '';
    if (relayName === 'waterPump') {
      if (triggeredBy === 'manual') {
        esp32Command = `WATER:MANUAL:${state ? 'ON' : 'OFF'}`;
      } else {
        esp32Command = 'WATER:AUTO';
      }
    } else if (relayName === 'ventilationFan') {
      if (triggeredBy === 'manual') {
        esp32Command = `FAN:MANUAL:${state ? 'ON' : 'OFF'}`;
      } else {
        esp32Command = 'FAN:AUTO';
      }
    } else if (relayName === 'fertilizerPump') {
      esp32Command = `FERTILIZER:${state ? 'ON' : 'OFF'}`;
    } else {
      // Legacy command format
      esp32Command = `${relayName.toUpperCase()}:${state ? 'ON' : 'OFF'}`;
    }
    
    // Add to command queue
    this.commandQueue.push({
      command: 'esp32_command',
      parameters: {
        relay: relayName,
        state,
        mode: this.relays[relayName].mode,
        pin: this.relays[relayName].pin,
        esp32Command
      },
      priority: triggeredBy === 'alert' ? 'critical' : 'high'
    });
  }
  
  return this.save();
};

// New method to set relay mode (AUTO/MANUAL)
deviceControlSchema.methods.setRelayMode = function(relayName, mode, userId = null, reason = '') {
  if (!this.relays[relayName]) {
    throw new Error(`Relay ${relayName} not found`);
  }
  
  if (!['AUTO', 'MANUAL'].includes(mode)) {
    throw new Error('Mode must be AUTO or MANUAL');
  }
  
  if (relayName === 'fertilizerPump' && mode === 'AUTO') {
    throw new Error('Fertilizer pump only supports MANUAL mode');
  }
  
  const previousMode = this.relays[relayName].mode;
  
  if (previousMode !== mode) {
    this.relays[relayName].mode = mode;
    
    // Add to history
    this.controlHistory.push({
      action: `set_mode_${relayName}`,
      relay: relayName,
      previousState: previousMode,
      newState: mode,
      triggeredBy: 'manual',
      userId,
      reason: reason || `Set ${relayName} to ${mode} mode`
    });
    
    // Generate ESP32 command
    let esp32Command = '';
    if (relayName === 'waterPump') {
      esp32Command = `WATER:${mode}`;
    } else if (relayName === 'ventilationFan') {
      esp32Command = `FAN:${mode}`;
    }
    
    // Add to command queue
    this.commandQueue.push({
      command: 'esp32_command',
      parameters: {
        relay: relayName,
        mode,
        esp32Command
      },
      priority: 'high'
    });
  }
  
  return this.save();
};

// Instance method to update device status
deviceControlSchema.methods.updateStatus = function(statusData) {
  this.deviceStatus = { ...this.deviceStatus, ...statusData };
  this.deviceStatus.lastHeartbeat = new Date();
  return this.save();
};

// Instance method to get pending commands
deviceControlSchema.methods.getPendingCommands = function() {
  return this.commandQueue
    .filter(cmd => cmd.status === 'pending')
    .sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
};

// Instance method to acknowledge command
deviceControlSchema.methods.acknowledgeCommand = function(commandId) {
  const command = this.commandQueue.id(commandId);
  if (command) {
    command.status = 'acknowledged';
    command.acknowledgedAt = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('DeviceControl', deviceControlSchema);
