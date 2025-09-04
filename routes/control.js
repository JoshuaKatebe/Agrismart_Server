const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/controlController');
const { authenticateToken, authenticateDevice } = require('../middleware/auth');

// Mobile App / Web Dashboard Routes (Private - JWT required)

// @route   GET /api/control/:deviceId
// @desc    Get device control states
// @access  Private
router.get('/:deviceId', authenticateToken, getControlStates);

// @route   POST /api/control/:deviceId/toggle/:relayName
// @desc    Toggle relay state
// @access  Private
router.post('/:deviceId/toggle/:relayName', authenticateToken, toggleRelay);

// @route   PUT /api/control/:deviceId/relay/:relayName
// @desc    Set relay state
// @access  Private
router.put('/:deviceId/relay/:relayName', authenticateToken, setRelayState);

// @route   PUT /api/control/:deviceId/relay/:relayName/mode
// @desc    Set relay mode (AUTO/MANUAL)
// @access  Private
router.put('/:deviceId/relay/:relayName/mode', authenticateToken, setRelayMode);

// @route   GET /api/control/:deviceId/history
// @desc    Get control history
// @access  Private
router.get('/:deviceId/history', authenticateToken, getControlHistory);

// @route   PUT /api/control/:deviceId/automation
// @desc    Update automation rules
// @access  Private
router.put('/:deviceId/automation', authenticateToken, updateAutomationRules);

// @route   POST /api/control/:deviceId/override
// @desc    Set manual override
// @access  Private
router.post('/:deviceId/override', authenticateToken, setManualOverride);

// @route   DELETE /api/control/:deviceId/override
// @desc    Remove manual override
// @access  Private
router.delete('/:deviceId/override', authenticateToken, removeManualOverride);

// @route   GET /api/control/:deviceId/status
// @desc    Get device status with failsafe information
// @access  Private
router.get('/:deviceId/status', authenticateToken, getDeviceStatusWithFailsafe);

// @route   POST /api/control/:deviceId/failsafe
// @desc    Trigger failsafe mode for offline device
// @access  Private
router.post('/:deviceId/failsafe', authenticateToken, triggerFailsafe);

// ESP32/Arduino Device Routes (Device API Key required)

// @route   GET /api/control/:deviceId/commands
// @desc    Get pending commands for ESP32
// @access  Device (API Key required)
router.get('/:deviceId/commands', authenticateDevice, getPendingCommands);

// @route   POST /api/control/:deviceId/commands/:commandId/ack
// @desc    Acknowledge command execution
// @access  Device (API Key required)
router.post('/:deviceId/commands/:commandId/ack', authenticateDevice, acknowledgeCommand);

// @route   POST /api/control/:deviceId/status
// @desc    Update device status from ESP32
// @access  Device (API Key required)
router.post('/:deviceId/status', authenticateDevice, updateDeviceStatus);

module.exports = router;
