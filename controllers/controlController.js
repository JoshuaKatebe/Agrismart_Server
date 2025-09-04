const DeviceControl = require('../models/DeviceControl');
const Greenhouse = require('../models/Greenhouse');
const moment = require('moment');

// @desc    Get device control states
// @route   GET /api/control/:deviceId
// @access  Private
const getControlStates = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const deviceControl = await DeviceControl.findOne({ deviceId })
      .populate('userId', 'username firstName lastName')
      .populate('greenhouseId', 'name location');

    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    res.json({
      success: true,
      data: {
        deviceId: deviceControl.deviceId,
        relays: deviceControl.relays,
        automationRules: deviceControl.automationRules,
        manualOverrides: deviceControl.manualOverrides,
        deviceStatus: deviceControl.deviceStatus,
        pendingCommands: deviceControl.getPendingCommands(),
        greenhouse: deviceControl.greenhouseId,
        user: deviceControl.userId
      }
    });

  } catch (error) {
    console.error('Get control states error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Toggle relay state
// @route   POST /api/control/:deviceId/toggle/:relayName
// @access  Private
const toggleRelay = async (req, res) => {
  try {
    const { deviceId, relayName } = req.params;
    const { reason = 'Manual toggle' } = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    if (!deviceControl.relays[relayName]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid relay name'
      });
    }

    const previousState = deviceControl.relays[relayName].state;
    await deviceControl.toggleRelay(relayName, req.user._id, reason);

    // Update greenhouse stats
    const greenhouse = await Greenhouse.findById(deviceControl.greenhouseId);
    if (greenhouse) {
      greenhouse.stats.totalControlActions += 1;
      await greenhouse.save();
    }

    res.json({
      success: true,
      message: `${relayName} toggled successfully`,
      data: {
        relayName,
        previousState,
        newState: !previousState,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Toggle relay error:', error);
    if (error.message.includes('not found')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Set relay state
// @route   PUT /api/control/:deviceId/relay/:relayName
// @access  Private
const setRelayState = async (req, res) => {
  try {
    const { deviceId, relayName } = req.params;
    const { state, reason = 'Manual control' } = req.body;

    if (typeof state !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'State must be a boolean value (true or false)'
      });
    }

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    if (!deviceControl.relays[relayName]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid relay name'
      });
    }

    const previousState = deviceControl.relays[relayName].state;
    await deviceControl.setRelay(relayName, state, 'manual', req.user._id, reason);

    // Update greenhouse stats
    const greenhouse = await Greenhouse.findById(deviceControl.greenhouseId);
    if (greenhouse) {
      greenhouse.stats.totalControlActions += 1;
      await greenhouse.save();
    }

    res.json({
      success: true,
      message: `${relayName} ${state ? 'turned on' : 'turned off'} successfully`,
      data: {
        relayName,
        previousState,
        newState: state,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Set relay state error:', error);
    if (error.message.includes('not found')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get control history
// @route   GET /api/control/:deviceId/history
// @access  Private
const getControlHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50, page = 1, relayName, triggeredBy } = req.query;

    const deviceControl = await DeviceControl.findOne({ deviceId })
      .populate('controlHistory.userId', 'username firstName lastName');

    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    let history = [...deviceControl.controlHistory];

    // Filter by relay name if specified
    if (relayName) {
      history = history.filter(h => h.relay === relayName);
    }

    // Filter by trigger type if specified
    if (triggeredBy) {
      history = history.filter(h => h.triggeredBy === triggeredBy);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedHistory = history.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(history.length / limit),
        totalRecords: history.length,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get control history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Update automation rules
// @route   PUT /api/control/:deviceId/automation
// @access  Private
const updateAutomationRules = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { automationRules } = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    // Update automation rules
    deviceControl.automationRules = {
      ...deviceControl.automationRules,
      ...automationRules
    };

    await deviceControl.save();

    res.json({
      success: true,
      message: 'Automation rules updated successfully',
      data: {
        automationRules: deviceControl.automationRules
      }
    });

  } catch (error) {
    console.error('Update automation rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Set manual override
// @route   POST /api/control/:deviceId/override
// @access  Private
const setManualOverride = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { duration = 3600, reason = 'Manual override' } = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    deviceControl.manualOverrides = {
      active: true,
      duration,
      startTime: new Date(),
      reason,
      overriddenBy: req.user._id
    };

    await deviceControl.save();

    // Schedule to remove override after duration
    setTimeout(async () => {
      try {
        const updatedControl = await DeviceControl.findOne({ deviceId });
        if (updatedControl && updatedControl.manualOverrides.active) {
          updatedControl.manualOverrides.active = false;
          await updatedControl.save();
        }
      } catch (error) {
        console.error('Auto-remove override error:', error);
      }
    }, duration * 1000);

    res.json({
      success: true,
      message: 'Manual override activated',
      data: {
        override: deviceControl.manualOverrides
      }
    });

  } catch (error) {
    console.error('Set manual override error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Remove manual override
// @route   DELETE /api/control/:deviceId/override
// @access  Private
const removeManualOverride = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    deviceControl.manualOverrides.active = false;
    await deviceControl.save();

    res.json({
      success: true,
      message: 'Manual override removed',
      data: {
        override: deviceControl.manualOverrides
      }
    });

  } catch (error) {
    console.error('Remove manual override error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get pending commands for ESP32
// @route   GET /api/control/:deviceId/commands
// @access  Device (API Key required)
const getPendingCommands = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    const pendingCommands = deviceControl.getPendingCommands();

    // Mark commands as sent
    pendingCommands.forEach(command => {
      command.status = 'sent';
      command.sentAt = new Date();
    });

    await deviceControl.save();

    res.json({
      success: true,
      data: {
        commands: pendingCommands,
        count: pendingCommands.length
      }
    });

  } catch (error) {
    console.error('Get pending commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Acknowledge command execution
// @route   POST /api/control/:deviceId/commands/:commandId/ack
// @access  Device (API Key required)
const acknowledgeCommand = async (req, res) => {
  try {
    const { deviceId, commandId } = req.params;
    const { success: commandSuccess, error: commandError } = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    const command = deviceControl.commandQueue.id(commandId);
    if (!command) {
      return res.status(404).json({
        success: false,
        message: 'Command not found'
      });
    }

    command.status = commandSuccess ? 'acknowledged' : 'failed';
    command.acknowledgedAt = new Date();
    
    if (commandError) {
      command.error = commandError;
    }

    await deviceControl.save();

    res.json({
      success: true,
      message: 'Command acknowledged',
      data: {
        commandId,
        status: command.status
      }
    });

  } catch (error) {
    console.error('Acknowledge command error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Update device status from ESP32
// @route   POST /api/control/:deviceId/status
// @access  Device (API Key required)
const updateDeviceStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const statusData = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      // Create new device control if it doesn't exist
      const newDeviceControl = new DeviceControl({
        deviceId,
        userId: req.body.userId,
        greenhouseId: req.body.greenhouseId,
        deviceStatus: statusData
      });
      await newDeviceControl.save();
      
      return res.status(201).json({
        success: true,
        message: 'Device control created and status updated'
      });
    }

    await deviceControl.updateStatus(statusData);

    res.json({
      success: true,
      message: 'Device status updated',
      data: {
        deviceStatus: deviceControl.deviceStatus
      }
    });

  } catch (error) {
    console.error('Update device status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Set relay mode (AUTO/MANUAL) for enhanced relays
// @route   PUT /api/control/:deviceId/relay/:relayName/mode
// @access  Private
const setRelayMode = async (req, res) => {
  try {
    const { deviceId, relayName } = req.params;
    const { mode, reason = 'Mode change requested' } = req.body;

    if (!['AUTO', 'MANUAL'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Mode must be AUTO or MANUAL'
      });
    }

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    if (!deviceControl.relays[relayName]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid relay name'
      });
    }

    // Check if relay supports mode switching
    if (!['waterPump', 'ventilationFan'].includes(relayName)) {
      return res.status(400).json({
        success: false,
        message: `Relay ${relayName} does not support mode switching`
      });
    }

    const previousMode = deviceControl.relays[relayName].mode;
    await deviceControl.setRelayMode(relayName, mode, req.user._id, reason);

    // Update greenhouse stats
    const greenhouse = await Greenhouse.findById(deviceControl.greenhouseId);
    if (greenhouse) {
      greenhouse.stats.totalControlActions += 1;
      await greenhouse.save();
    }

    res.json({
      success: true,
      message: `${relayName} mode changed to ${mode}`,
      data: {
        relayName,
        previousMode,
        newMode: mode,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Set relay mode error:', error);
    if (error.message.includes('not found') || error.message.includes('supports')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get device status with failsafe information
// @route   GET /api/control/:deviceId/status
// @access  Private
const getDeviceStatusWithFailsafe = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const deviceControl = await DeviceControl.findOne({ deviceId })
      .populate('userId', 'username firstName lastName')
      .populate('greenhouseId', 'name location');

    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    // Check if device is online (received data within last 10 minutes)
    const isOnline = moment().diff(moment(deviceControl.deviceStatus.lastHeartbeat), 'minutes') <= 10;
    
    // Check failsafe status
    const failsafeActive = !isOnline && deviceControl.automationRules?.failsafe?.enabled;
    
    res.json({
      success: true,
      data: {
        deviceId: deviceControl.deviceId,
        online: isOnline,
        lastHeartbeat: deviceControl.deviceStatus.lastHeartbeat,
        deviceStatus: deviceControl.deviceStatus,
        failsafeActive,
        relayStates: deviceControl.relays,
        pendingCommands: deviceControl.getPendingCommands().length,
        greenhouse: deviceControl.greenhouseId,
        user: deviceControl.userId
      }
    });

  } catch (error) {
    console.error('Get device status with failsafe error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Trigger failsafe mode for offline device
// @route   POST /api/control/:deviceId/failsafe
// @access  Private
const triggerFailsafe = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { reason = 'Manual failsafe activation' } = req.body;

    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl) {
      return res.status(404).json({
        success: false,
        message: 'Device control not found'
      });
    }

    // Activate failsafe procedures
    const failsafeActions = [];

    // Emergency water pump activation if soil moisture is critically low
    if (deviceControl.relays.waterPump && deviceControl.relays.waterPump.mode === 'AUTO') {
      deviceControl.relays.waterPump.state = true;
      deviceControl.relays.waterPump.mode = 'MANUAL';
      failsafeActions.push('Water pump activated in manual mode');
    }

    // Emergency ventilation if temperature thresholds exceeded
    if (deviceControl.relays.ventilationFan) {
      deviceControl.relays.ventilationFan.state = true;
      deviceControl.relays.ventilationFan.mode = 'MANUAL';
      failsafeActions.push('Ventilation fan activated in manual mode');
    }

    // Log failsafe activation
    deviceControl.controlHistory.push({
      action: 'failsafe_activation',
      relay: 'system',
      previousState: false,
      newState: true,
      triggeredBy: 'alert',
      userId: req.user._id,
      reason
    });

    await deviceControl.save();

    res.json({
      success: true,
      message: 'Failsafe mode activated',
      data: {
        deviceId,
        actions: failsafeActions,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Trigger failsafe error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getControlStates,
  toggleRelay,
  setRelayState,
  setRelayMode,
  getControlHistory,
  updateAutomationRules,
  setManualOverride,
  removeManualOverride,
  getPendingCommands,
  acknowledgeCommand,
  updateDeviceStatus,
  getDeviceStatusWithFailsafe,
  triggerFailsafe
};
