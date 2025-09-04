const express = require('express');
const router = express.Router();
const {
  getAllCameras,
  getCameraInfo,
  updateCameraSettings,
  takeSnapshot,
  getSnapshots,
  getSnapshot,
  deleteSnapshot,
  getStreamUrl,
  startRecording,
  stopRecording,
  getCameraStats,
  takeEmergencySnapshot
} = require('../controllers/cameraController');
const { authenticateToken, authenticateDevice } = require('../middleware/auth');

// Public/User Routes (JWT Authentication Required)

// @route   GET /api/cameras
// @desc    Get all active cameras
// @access  Private
router.get('/', authenticateToken, getAllCameras);

// @route   GET /api/cameras/:deviceId
// @desc    Get specific camera info
// @access  Private
router.get('/:deviceId', authenticateToken, getCameraInfo);

// @route   PUT /api/cameras/:deviceId/settings
// @desc    Update camera settings
// @access  Private
router.put('/:deviceId/settings', authenticateToken, updateCameraSettings);

// @route   POST /api/cameras/:deviceId/snapshot
// @desc    Take a manual snapshot
// @access  Private
router.post('/:deviceId/snapshot', authenticateToken, takeSnapshot);

// @route   GET /api/cameras/:deviceId/snapshots
// @desc    Get snapshots for a device
// @access  Private
router.get('/:deviceId/snapshots', authenticateToken, getSnapshots);

// @route   GET /api/cameras/snapshot/:filename
// @desc    View or download a snapshot
// @access  Private
router.get('/snapshot/:filename', authenticateToken, getSnapshot);

// @route   DELETE /api/cameras/snapshot/:filename
// @desc    Delete a snapshot
// @access  Private
router.delete('/snapshot/:filename', authenticateToken, deleteSnapshot);

// @route   GET /api/cameras/:deviceId/stream
// @desc    Get camera stream info
// @access  Private
router.get('/:deviceId/stream', authenticateToken, getStreamUrl);

// @route   GET /api/cameras/:deviceId/stats
// @desc    Get camera statistics
// @access  Private
router.get('/:deviceId/stats', authenticateToken, getCameraStats);

// Recording Routes (Future Implementation)
// @route   POST /api/cameras/:deviceId/recording/start
// @desc    Start recording
// @access  Private
router.post('/:deviceId/recording/start', authenticateToken, startRecording);

// @route   POST /api/cameras/:deviceId/recording/stop
// @desc    Stop recording
// @access  Private
router.post('/:deviceId/recording/stop', authenticateToken, stopRecording);

// System/Internal Routes (Device Authentication Required)

// @route   POST /api/cameras/:deviceId/emergency-snapshot
// @desc    Take emergency snapshot (triggered by system alerts)
// @access  System/Device
router.post('/:deviceId/emergency-snapshot', authenticateDevice, takeEmergencySnapshot);

module.exports = router;
