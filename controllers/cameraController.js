const fs = require('fs');
const path = require('path');
const moment = require('moment');

// @desc    Get all active cameras
// @route   GET /api/cameras
// @access  Private
const getAllCameras = async (req, res) => {
  try {
    const cameraService = req.app.get('cameraService');
    const cameras = cameraService.getAllCameras();

    res.json({
      success: true,
      data: cameras,
      count: cameras.length
    });
  } catch (error) {
    console.error('Get all cameras error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get specific camera info
// @route   GET /api/cameras/:deviceId
// @access  Private
const getCameraInfo = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const cameraService = req.app.get('cameraService');
    const camera = cameraService.getCameraInfo(deviceId);

    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    res.json({
      success: true,
      data: camera
    });
  } catch (error) {
    console.error('Get camera info error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Update camera settings
// @route   PUT /api/cameras/:deviceId/settings
// @access  Private
const updateCameraSettings = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { settings } = req.body;

    const cameraService = req.app.get('cameraService');
    const success = cameraService.updateCameraSettings(deviceId, settings);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    res.json({
      success: true,
      message: 'Camera settings updated successfully',
      data: { deviceId, settings }
    });
  } catch (error) {
    console.error('Update camera settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Take a snapshot
// @route   POST /api/cameras/:deviceId/snapshot
// @access  Private
const takeSnapshot = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { reason = 'manual' } = req.body;

    const cameraService = req.app.get('cameraService');
    const snapshot = await cameraService.takeSnapshot(deviceId, { reason });

    res.json({
      success: true,
      message: 'Snapshot taken successfully',
      data: snapshot
    });
  } catch (error) {
    console.error('Take snapshot error:', error);
    
    if (error.message.includes('not available')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to take snapshot'
    });
  }
};

// @desc    Get snapshots for a device
// @route   GET /api/cameras/:deviceId/snapshots
// @access  Private
const getSnapshots = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 20 } = req.query;

    const cameraService = req.app.get('cameraService');
    const snapshots = cameraService.getSnapshots(deviceId, parseInt(limit));

    res.json({
      success: true,
      data: snapshots,
      count: snapshots.length
    });
  } catch (error) {
    console.error('Get snapshots error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Download/view a snapshot
// @route   GET /api/cameras/snapshot/:filename
// @access  Private
const getSnapshot = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join('uploads/cameras/snapshots', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      });
    }

    // Check if client wants to download or view
    const download = req.query.download === 'true';
    
    if (download) {
      res.download(filepath, filename);
    } else {
      res.sendFile(path.resolve(filepath));
    }
  } catch (error) {
    console.error('Get snapshot error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Delete a snapshot
// @route   DELETE /api/cameras/snapshot/:filename
// @access  Private
const deleteSnapshot = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join('uploads/cameras/snapshots', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      });
    }

    fs.unlinkSync(filepath);

    // Remove from camera service if it exists
    const cameraService = req.app.get('cameraService');
    cameraService.snapshots.delete(filename);

    res.json({
      success: true,
      message: 'Snapshot deleted successfully'
    });
  } catch (error) {
    console.error('Delete snapshot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete snapshot'
    });
  }
};

// @desc    Get camera stream URL (for embedding)
// @route   GET /api/cameras/:deviceId/stream
// @access  Private
const getStreamUrl = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const cameraService = req.app.get('cameraService');
    const camera = cameraService.getCameraInfo(deviceId);

    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found or offline'
      });
    }

    // Return streaming information
    res.json({
      success: true,
      data: {
        deviceId,
        streamType: 'websocket',
        endpoint: `/api/cameras/${deviceId}/websocket`,
        status: camera.isActive ? 'active' : 'inactive',
        settings: camera.settings,
        stats: camera.stats
      }
    });
  } catch (error) {
    console.error('Get stream URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Start camera recording
// @route   POST /api/cameras/:deviceId/recording/start
// @access  Private
const startRecording = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { duration = 300 } = req.body; // 5 minutes default

    // This would be implemented with video recording capability
    // For now, we'll return a placeholder response
    res.json({
      success: true,
      message: 'Recording feature will be implemented in future version',
      data: {
        deviceId,
        duration,
        status: 'not_implemented'
      }
    });
  } catch (error) {
    console.error('Start recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Stop camera recording
// @route   POST /api/cameras/:deviceId/recording/stop
// @access  Private
const stopRecording = async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Placeholder for recording stop functionality
    res.json({
      success: true,
      message: 'Recording stop feature will be implemented in future version',
      data: {
        deviceId,
        status: 'not_implemented'
      }
    });
  } catch (error) {
    console.error('Stop recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get camera statistics
// @route   GET /api/cameras/:deviceId/stats
// @access  Private
const getCameraStats = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const cameraService = req.app.get('cameraService');
    const camera = cameraService.getCameraInfo(deviceId);

    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    const stats = {
      ...camera.stats,
      uptime: Date.now() - camera.startTime.getTime(),
      viewerCount: camera.viewerCount,
      settings: camera.settings,
      snapshotCount: cameraService.getSnapshots(deviceId, 1000).length
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get camera stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Emergency snapshot (triggered by alerts)
// @route   POST /api/cameras/:deviceId/emergency-snapshot
// @access  System/Internal
const takeEmergencySnapshot = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { alertType, alertData } = req.body;

    const cameraService = req.app.get('cameraService');
    const snapshot = await cameraService.takeEmergencySnapshot(deviceId, alertType, alertData);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Failed to take emergency snapshot'
      });
    }

    res.json({
      success: true,
      message: 'Emergency snapshot taken successfully',
      data: snapshot
    });
  } catch (error) {
    console.error('Emergency snapshot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to take emergency snapshot'
    });
  }
};

module.exports = {
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
};
