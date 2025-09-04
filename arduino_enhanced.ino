#include <Arduino.h>
#include "dht.h"
#include <SPI.h>
#include <MFRC522.h>
#include <SoftwareSerial.h>
#include <ph4502c_sensor.h>

// ---------------- DHT ----------------
#define DHT1_PIN A4   // Outside temperature (moved from D8)
#define DHT2_PIN A5   // Greenhouse temperature (moved from D7)
dht DHT1;
dht DHT2;

// ---------------- Other Sensors ----------------
#define TRIG_PIN 6   // D6
#define ECHO_PIN 5   // D5
#define LDR_PIN A3
#define SOIL_PIN A2
#define PH4502C_PH_LEVEL_PIN A0
#define PH4502C_TEMP_PIN A1

// ---------------- Relay Pins ----------------
#define WATER_PUMP_PIN 4     // Water pump relay
#define FERTILIZER_PUMP_PIN 7 // Fertilizer pump relay (new)
#define VENTILATION_FAN_PIN 8 // Ventilation fan relay (new)

// ---------------- Control Modes ----------------
enum ControlMode {
  AUTOMATIC = 0,
  MANUAL = 1
};

struct RelayControl {
  ControlMode mode;
  bool manualState;
  bool currentState;
};

RelayControl waterPump = {AUTOMATIC, false, false};
RelayControl ventilationFan = {AUTOMATIC, false, false};
bool fertilizerPumpState = false; // Fertilizer pump is manual only

// Soil moisture calibration
const int dryVal = 800;
const int wetVal = 300;

// Tank calibration
const int emptyDist = 25;
const int fullDist = 5;

// Temperature thresholds
const float GREENHOUSE_TEMP_THRESHOLD = 30.0; // °C

// ---------------- RFID ----------------
#define SS_PIN 10
#define RST_PIN 9
MFRC522 mfrc522(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;
String inputText = "";

// ---------------- pH Sensor ----------------
PH4502C_Sensor ph4502(PH4502C_PH_LEVEL_PIN, PH4502C_TEMP_PIN);

// ---------------- Serial to ESP32 ----------------
SoftwareSerial espSerial(2, 3); // RX, TX

void setup() {
  Serial.begin(9600);       // Debug over USB
  espSerial.begin(9600);    // Send data to ESP32

  // Initialize sensor pins
  pinMode(SOIL_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Initialize relay pins
  pinMode(WATER_PUMP_PIN, OUTPUT);
  pinMode(FERTILIZER_PUMP_PIN, OUTPUT);
  pinMode(VENTILATION_FAN_PIN, OUTPUT);
  
  // Ensure all relays start OFF
  digitalWrite(WATER_PUMP_PIN, LOW);
  digitalWrite(FERTILIZER_PUMP_PIN, LOW);
  digitalWrite(VENTILATION_FAN_PIN, LOW);

  // RFID init
  SPI.begin();
  mfrc522.PCD_Init();
  for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;

  // pH init
  ph4502.init();

  Serial.println("Arduino Enhanced Sensor+RFID+Relay node ready.");
}

void processESP32Commands() {
  if (espSerial.available()) {
    String command = espSerial.readStringUntil('\n');
    command.trim();
    
    Serial.println("Received command: " + command);
    
    // Command format: "PUMP:AUTO/MANUAL:ON/OFF" or "FAN:AUTO/MANUAL:ON/OFF" or "FERTILIZER:ON/OFF"
    if (command.startsWith("WATER:")) {
      if (command.indexOf("AUTO") != -1) {
        waterPump.mode = AUTOMATIC;
        Serial.println("Water pump set to AUTOMATIC mode");
      } else if (command.indexOf("MANUAL") != -1) {
        waterPump.mode = MANUAL;
        if (command.indexOf("ON") != -1) {
          waterPump.manualState = true;
        } else if (command.indexOf("OFF") != -1) {
          waterPump.manualState = false;
        }
        Serial.println("Water pump set to MANUAL mode, state: " + String(waterPump.manualState ? "ON" : "OFF"));
      }
    }
    else if (command.startsWith("FAN:")) {
      if (command.indexOf("AUTO") != -1) {
        ventilationFan.mode = AUTOMATIC;
        Serial.println("Ventilation fan set to AUTOMATIC mode");
      } else if (command.indexOf("MANUAL") != -1) {
        ventilationFan.mode = MANUAL;
        if (command.indexOf("ON") != -1) {
          ventilationFan.manualState = true;
        } else if (command.indexOf("OFF") != -1) {
          ventilationFan.manualState = false;
        }
        Serial.println("Ventilation fan set to MANUAL mode, state: " + String(ventilationFan.manualState ? "ON" : "OFF"));
      }
    }
    else if (command.startsWith("FERTILIZER:")) {
      if (command.indexOf("ON") != -1) {
        fertilizerPumpState = true;
      } else if (command.indexOf("OFF") != -1) {
        fertilizerPumpState = false;
      }
      Serial.println("Fertilizer pump set to: " + String(fertilizerPumpState ? "ON" : "OFF"));
    }
  }
}

void controlWaterPump(int soilPercent, int tankPercent) {
  if (waterPump.mode == AUTOMATIC) {
    // Automatic mode: Turn on if soil is dry and tank has water
    if (soilPercent < 50 && tankPercent > 20) {
      waterPump.currentState = true;
    } else {
      waterPump.currentState = false;
    }
  } else {
    // Manual mode: Use manual state
    waterPump.currentState = waterPump.manualState;
  }
  
  digitalWrite(WATER_PUMP_PIN, waterPump.currentState ? HIGH : LOW);
}

void controlVentilationFan(float greenhouseTemp) {
  if (ventilationFan.mode == AUTOMATIC) {
    // Automatic mode: Turn on if greenhouse temperature is above threshold
    if (greenhouseTemp > GREENHOUSE_TEMP_THRESHOLD) {
      ventilationFan.currentState = true;
    } else {
      ventilationFan.currentState = false;
    }
  } else {
    // Manual mode: Use manual state
    ventilationFan.currentState = ventilationFan.manualState;
  }
  
  digitalWrite(VENTILATION_FAN_PIN, ventilationFan.currentState ? HIGH : LOW);
}

void controlFertilizerPump() {
  // Fertilizer pump is manual only
  digitalWrite(FERTILIZER_PUMP_PIN, fertilizerPumpState ? HIGH : LOW);
}

void loop() {
  // Process any commands from ESP32
  processESP32Commands();
  
  // --- Read DHT sensors ---
  DHT1.read11(DHT1_PIN);
  DHT2.read11(DHT2_PIN);
  float temp1 = DHT1.temperature;  // Outside temperature
  float hum1 = DHT1.humidity;
  float temp2 = DHT2.temperature;  // Greenhouse temperature
  float hum2 = DHT2.humidity;

  // --- Soil Moisture ---
  int soilRaw = analogRead(SOIL_PIN);
  int soilPercent = map(soilRaw, dryVal, wetVal, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);

  // --- LDR ---
  int ldrRaw = analogRead(LDR_PIN);
  int ldrPercent = map(ldrRaw, 0, 1023, 0, 100);

  // --- Ultrasonic Tank ---
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2;
  int tankPercent = map(distance, emptyDist, fullDist, 0, 100);
  tankPercent = constrain(tankPercent, 0, 100);

  // --- pH Sensor ---
  float phTemp = ph4502.read_temp();
  float phLevel = ph4502.read_ph_level();

  // --- Control Relays ---
  controlWaterPump(soilPercent, tankPercent);
  controlVentilationFan(temp2); // Use greenhouse temperature (temp2)
  controlFertilizerPump();

  // --- RFID ---
  String rfidMsg = "NoCard";
  if (Serial.available()) {
    inputText = Serial.readStringUntil('\n');
    inputText.trim();
    if (inputText.length() > 16) inputText = inputText.substring(0, 16);
  }
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    byte block = 4;
    MFRC522::StatusCode status;
    status = mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A,
                                      block, &key, &(mfrc522.uid));
    if (status == MFRC522::STATUS_OK) {
      if (inputText.length() > 0) {
        byte dataBlock[16];
        for (byte i = 0; i < 16; i++) {
          if (i < inputText.length()) dataBlock[i] = inputText[i];
          else dataBlock[i] = ' ';
        }
        status = mfrc522.MIFARE_Write(block, dataBlock, 16);
        rfidMsg = (status == MFRC522::STATUS_OK) ? "WriteOK" : "WriteFAIL";
      }

      byte buffer[18]; byte size = sizeof(buffer);
      status = mfrc522.MIFARE_Read(block, buffer, &size);
      if (status == MFRC522::STATUS_OK) {
        rfidMsg = "";
        for (uint8_t i = 0; i < 16; i++) rfidMsg += (char)buffer[i];
      } else {
        rfidMsg = "ReadFAIL";
      }
    }
    inputText = "";
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
  }

  // --- Send all data to ESP32 ---
  String dataPacket = "T1:" + String(temp1) +
                      ",H1:" + String(hum1) +
                      ",T2:" + String(temp2) +
                      ",H2:" + String(hum2) +
                      ",Soil:" + String(soilPercent) +
                      ",Light:" + String(ldrPercent) +
                      ",Tank:" + String(tankPercent) +
                      ",pH:" + String(phLevel) +
                      ",WaterPump:" + (waterPump.currentState ? "ON" : "OFF") +
                      ",WaterMode:" + (waterPump.mode == AUTOMATIC ? "AUTO" : "MANUAL") +
                      ",Fan:" + (ventilationFan.currentState ? "ON" : "OFF") +
                      ",FanMode:" + (ventilationFan.mode == AUTOMATIC ? "AUTO" : "MANUAL") +
                      ",Fertilizer:" + (fertilizerPumpState ? "ON" : "OFF") +
                      ",RFID:" + rfidMsg;

  espSerial.println(dataPacket);
  Serial.println("Sent: " + dataPacket);

  delay(3000); // Update every 3s
}
