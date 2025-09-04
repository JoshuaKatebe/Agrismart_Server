const mongoose = require('mongoose');

const greenhouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Greenhouse name is required'],
    trim: true,
    maxlength: [100, 'Greenhouse name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  dimensions: {
    length: { type: Number, min: 0 }, // meters
    width: { type: Number, min: 0 },  // meters
    height: { type: Number, min: 0 }, // meters
    area: { type: Number, min: 0 }    // square meters
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner is required']
  },
  managers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  devices: [{
    deviceId: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['esp32', 'arduino', 'raspberry_pi', 'sensor_node'],
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance', 'error'],
      default: 'inactive'
    },
    lastSeen: Date,
    configuration: mongoose.Schema.Types.Mixed
  }],
  crops: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    variety: String,
    plantedDate: Date,
    expectedHarvestDate: Date,
    status: {
      type: String,
      enum: ['planted', 'growing', 'flowering', 'fruiting', 'ready_to_harvest', 'harvested'],
      default: 'planted'
    },
    zone: String,
    notes: String
  }],
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    units: {
      temperature: {
        type: String,
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      },
      length: {
        type: String,
        enum: ['metric', 'imperial'],
        default: 'metric'
      }
    },
    dataRetention: {
      sensorData: {
        type: Number,
        default: 90 // days
      },
      controlHistory: {
        type: Number,
        default: 30 // days
      }
    },
    notifications: {
      email: {
        enabled: { type: Boolean, default: true },
        recipients: [String]
      },
      sms: {
        enabled: { type: Boolean, default: false },
        recipients: [String]
      },
      push: {
        enabled: { type: Boolean, default: true }
      }
    }
  },
  stats: {
    totalSensorReadings: { type: Number, default: 0 },
    totalControlActions: { type: Number, default: 0 },
    totalAlerts: { type: Number, default: 0 },
    lastDataReceived: Date,
    uptimeHours: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
greenhouseSchema.index({ owner: 1 });
greenhouseSchema.index({ managers: 1 });
greenhouseSchema.index({ 'devices.deviceId': 1 });
greenhouseSchema.index({ isActive: 1 });

// Virtual for total area calculation
greenhouseSchema.virtual('totalArea').get(function() {
  return this.dimensions.length * this.dimensions.width;
});

// Virtual for active devices count
greenhouseSchema.virtual('activeDevicesCount').get(function() {
  return this.devices.filter(device => device.status === 'active').length;
});

// Virtual for current crops count
greenhouseSchema.virtual('currentCropsCount').get(function() {
  return this.crops.filter(crop => 
    ['planted', 'growing', 'flowering', 'fruiting'].includes(crop.status)
  ).length;
});

// Instance method to add device
greenhouseSchema.methods.addDevice = function(deviceData) {
  // Check if device already exists
  const existingDevice = this.devices.find(d => d.deviceId === deviceData.deviceId);
  if (existingDevice) {
    throw new Error('Device with this ID already exists');
  }
  
  this.devices.push(deviceData);
  return this.save();
};

// Instance method to update device status
greenhouseSchema.methods.updateDeviceStatus = function(deviceId, status, lastSeen = new Date()) {
  const device = this.devices.find(d => d.deviceId === deviceId);
  if (!device) {
    throw new Error('Device not found');
  }
  
  device.status = status;
  device.lastSeen = lastSeen;
  return this.save();
};

// Instance method to add manager
greenhouseSchema.methods.addManager = function(userId) {
  if (this.managers.includes(userId)) {
    throw new Error('User is already a manager');
  }
  
  this.managers.push(userId);
  return this.save();
};

// Instance method to remove manager
greenhouseSchema.methods.removeManager = function(userId) {
  this.managers = this.managers.filter(managerId => !managerId.equals(userId));
  return this.save();
};

// Instance method to add crop
greenhouseSchema.methods.addCrop = function(cropData) {
  this.crops.push(cropData);
  return this.save();
};

// Instance method to update crop status
greenhouseSchema.methods.updateCropStatus = function(cropId, status, notes = '') {
  const crop = this.crops.id(cropId);
  if (!crop) {
    throw new Error('Crop not found');
  }
  
  crop.status = status;
  if (notes) {
    crop.notes = notes;
  }
  
  return this.save();
};

// Instance method to check if user has access
greenhouseSchema.methods.hasUserAccess = function(userId) {
  return this.owner.equals(userId) || this.managers.includes(userId);
};

// Static method to find accessible greenhouses for user
greenhouseSchema.statics.findAccessibleByUser = function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { managers: userId }
    ],
    isActive: true
  }).populate('owner', 'username firstName lastName')
    .populate('managers', 'username firstName lastName');
};

// Static method to get greenhouse statistics
greenhouseSchema.statics.getStatistics = function(greenhouseId) {
  return this.findById(greenhouseId)
    .select('stats devices crops')
    .lean();
};

module.exports = mongoose.model('Greenhouse', greenhouseSchema);
