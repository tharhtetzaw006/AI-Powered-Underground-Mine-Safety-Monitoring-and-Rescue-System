/*
 * MINE-RESCUE OPERATIONS MONITOR - ESP32 FIELD NODE FIRMWARE
 * 
 * Hardware:
 *   - ESP32 DevKit / ESP32-WROOM
 *   - Ra-02 SX1278 LoRa Module (433MHz SPI)
 *   - GY-6500 / MPU6500 6-Axis IMU (I2C)
 *   - HC-SR04 Ultrasonic Distance Sensor
 *   - LM393 Sound Sensor (Analog A0)
 * 
 * Instructions:
 *   Change NODE_ID below for each physical node deployed (e.g. "NODE-01", "NODE-02", etc.)
 */

#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>

// ================= DEVICE CONFIGURATION =================
// Set unique node identifier per physical device
#define NODE_ID "NODE-01"

// Telemetry transmit period (milliseconds)
#define TELEMETRY_INTERVAL_MS 1000

// LoRa RF Settings (Ra-02 SX1278)
#define LORA_FREQUENCY 433E6    // 433.0 MHz
#define LORA_SYNC_WORD 0x12     // Private network sync word
#define LORA_SPREADING_FACTOR 7 // SF7 for robust underground balance of range and airtime
#define LORA_BANDWIDTH 125E3    // 125 kHz
#define LORA_TX_POWER 17        // 17 dBm

// Pin Definitions for Ra-02 LoRa
#define PIN_LORA_SCK  18
#define PIN_LORA_MISO 19
#define PIN_LORA_MOSI 23
#define PIN_LORA_CS   5
#define PIN_LORA_RST  14
#define PIN_LORA_DIO0 2

// Pin Definitions for I2C Sensors (GY-6500 / MPU6500)
#define PIN_I2C_SDA 21
#define PIN_I2C_SCL 22
#define MPU6500_ADDR 0x68

// Pin Definitions for HC-SR04 Ultrasonic
#define PIN_TRIG 4
#define PIN_ECHO 16 // Connect through 1k/2k voltage divider to 3.3V safe level

// Pin Definition for LM393 Sound Sensor Analog Output
#define PIN_SOUND_ADC 34 // ADC1_CH6 (Input only)

// ================= PACKET PROTOCOL =================
#define PROTOCOL_VERSION 0x01
#define MINE_PACKET_SIZE 47
#define FLAG_ACCEL_OK  (1 << 0)
#define FLAG_GYRO_OK   (1 << 1)
#define FLAG_DIST_OK   (1 << 2)
#define FLAG_SOUND_OK  (1 << 3)
#define FLAG_BATT_OK   (1 << 4)

#pragma pack(push, 1)
struct MinePacket {
  char magic[2];          // 'M', 'R' (0x4D, 0x52) - 2 bytes
  uint8_t version;        // 0x01 - 1 byte
  char nodeId[16];        // null-terminated string - 16 bytes
  uint16_t sequence;      // rolling sequence 0..65535 - 2 bytes
  uint32_t uptimeMs;      // Device uptime in milliseconds - 4 bytes
  uint8_t sensorFlags;    // Bitmask of available sensors - 1 byte
  int16_t accelX;         // m/s² * 100 - 2 bytes
  int16_t accelY;         // m/s² * 100 - 2 bytes
  int16_t accelZ;         // m/s² * 100 - 2 bytes
  int16_t gyroX;          // °/s * 10 - 2 bytes
  int16_t gyroY;          // °/s * 10 - 2 bytes
  int16_t gyroZ;          // °/s * 10 - 2 bytes
  int32_t distanceMm;     // mm (-1 if timeout / no echo) - 4 bytes
  int16_t acousticDb10;   // dB * 10 (-1 if error) - 2 bytes
  int8_t batteryPct;      // % (-1 if unmonitored) - 1 byte
  uint16_t crc;           // CRC16-CCITT - 2 bytes
};
#pragma pack(pop)
static_assert(sizeof(MinePacket) == MINE_PACKET_SIZE, "MinePacket must be exactly 47 bytes");

// Explicit byte serialization avoiding any compiler padding discrepancy
void serializeMinePacket(const MinePacket &pkt, uint8_t *buf) {
  buf[0] = (uint8_t)pkt.magic[0];
  buf[1] = (uint8_t)pkt.magic[1];
  buf[2] = pkt.version;
  memset(&buf[3], 0, 16);
  strncpy((char*)&buf[3], pkt.nodeId, 15);
  buf[19] = (uint8_t)(pkt.sequence >> 8);
  buf[20] = (uint8_t)(pkt.sequence & 0xFF);
  buf[21] = (uint8_t)(pkt.uptimeMs >> 24);
  buf[22] = (uint8_t)(pkt.uptimeMs >> 16);
  buf[23] = (uint8_t)(pkt.uptimeMs >> 8);
  buf[24] = (uint8_t)(pkt.uptimeMs & 0xFF);
  buf[25] = pkt.sensorFlags;
  buf[26] = (uint8_t)((uint16_t)pkt.accelX >> 8);
  buf[27] = (uint8_t)((uint16_t)pkt.accelX & 0xFF);
  buf[28] = (uint8_t)((uint16_t)pkt.accelY >> 8);
  buf[29] = (uint8_t)((uint16_t)pkt.accelY & 0xFF);
  buf[30] = (uint8_t)((uint16_t)pkt.accelZ >> 8);
  buf[31] = (uint8_t)((uint16_t)pkt.accelZ & 0xFF);
  buf[32] = (uint8_t)((uint16_t)pkt.gyroX >> 8);
  buf[33] = (uint8_t)((uint16_t)pkt.gyroX & 0xFF);
  buf[34] = (uint8_t)((uint16_t)pkt.gyroY >> 8);
  buf[35] = (uint8_t)((uint16_t)pkt.gyroY & 0xFF);
  buf[36] = (uint8_t)((uint16_t)pkt.gyroZ >> 8);
  buf[37] = (uint8_t)((uint16_t)pkt.gyroZ & 0xFF);
  buf[38] = (uint8_t)((uint32_t)pkt.distanceMm >> 24);
  buf[39] = (uint8_t)((uint32_t)pkt.distanceMm >> 16);
  buf[40] = (uint8_t)((uint32_t)pkt.distanceMm >> 8);
  buf[41] = (uint8_t)((uint32_t)pkt.distanceMm & 0xFF);
  buf[42] = (uint8_t)((uint16_t)pkt.acousticDb10 >> 8);
  buf[43] = (uint8_t)((uint16_t)pkt.acousticDb10 & 0xFF);
  buf[44] = (uint8_t)pkt.batteryPct;
  buf[45] = (uint8_t)(pkt.crc >> 8);
  buf[46] = (uint8_t)(pkt.crc & 0xFF);
}

// State Variables
static uint16_t g_sequenceNumber = 0;
static bool g_imuDetected = false;
static unsigned long g_lastTxTime = 0;

// CRC16-CCITT calculation
uint16_t calculateCrc16(const uint8_t *data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  return crc;
}

// Read single byte from I2C register
uint8_t readI2CRegister(uint8_t reg) {
  Wire.beginTransmission(MPU6500_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU6500_ADDR, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0xFF;
}

// Write single byte to I2C register
void writeI2CRegister(uint8_t reg, uint8_t data) {
  Wire.beginTransmission(MPU6500_ADDR);
  Wire.write(reg);
  Wire.write(data);
  Wire.endTransmission(true);
}

// Initialize MPU6500 IMU
bool initMPU6500() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  delay(50);

  uint8_t whoAmI = readI2CRegister(0x75); // WHO_AM_I register
  Serial.print(F("[IMU] WHO_AM_I: 0x"));
  Serial.println(whoAmI, HEX);

  // MPU-6500 typically returns 0x70, MPU-9250 returns 0x71 or 0x73, MPU-6050 returns 0x68
  if (whoAmI != 0x70 && whoAmI != 0x71 && whoAmI != 0x73 && whoAmI != 0x68) {
    Serial.println(F("[IMU] WARNING: Device not detected at address 0x68"));
    return false;
  }

  // Wake up MPU6500 (PWR_MGMT_1 = 0x00, use internal clock source)
  writeI2CRegister(0x6B, 0x00);
  delay(20);

  // Set Accelerometer full-scale range: ±4g (0x08)
  writeI2CRegister(0x1C, 0x08);

  // Set Gyroscope full-scale range: ±500 °/s (0x08)
  writeI2CRegister(0x1B, 0x08);

  // Enable Low Pass Filter (DLPF_CFG = 3 -> ~42Hz bandwidth)
  writeI2CRegister(0x1A, 0x03);

  Serial.println(F("[IMU] MPU6500 initialized successfully"));
  return true;
}

// Read raw acceleration and gyroscope values from MPU6500
bool readMPU6500(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  if (!g_imuDetected) {
    return false;
  }

  Wire.beginTransmission(MPU6500_ADDR);
  Wire.write(0x3B); // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((uint8_t)MPU6500_ADDR, (uint8_t)14) != 14) {
    return false;
  }

  int16_t rawAx = (Wire.read() << 8) | Wire.read();
  int16_t rawAy = (Wire.read() << 8) | Wire.read();
  int16_t rawAz = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read(); // Skip temperature bytes
  int16_t rawGx = (Wire.read() << 8) | Wire.read();
  int16_t rawGy = (Wire.read() << 8) | Wire.read();
  int16_t rawGz = (Wire.read() << 8) | Wire.read();

  // Convert raw values (±4g scale = 8192 LSB/g, 1g = 9.80665 m/s²)
  const float ACCEL_SCALE = 9.80665f / 8192.0f;
  ax = rawAx * ACCEL_SCALE;
  ay = rawAy * ACCEL_SCALE;
  az = rawAz * ACCEL_SCALE;

  // Convert raw values (±500 °/s scale = 65.5 LSB/(°/s))
  const float GYRO_SCALE = 1.0f / 65.5f;
  gx = rawGx * GYRO_SCALE;
  gy = rawGy * GYRO_SCALE;
  gz = rawGz * GYRO_SCALE;

  return true;
}

// Read ultrasonic distance from HC-SR04 in millimeters (-1 if no echo / timeout)
int32_t readHCSR04() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // 30ms timeout corresponds to approx 5.1 meters maximum distance
  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duration == 0) {
    return -1; // Out of range or sensor disconnected
  }

  // Speed of sound = 343 m/s = 0.343 mm/us. Distance = duration * 0.343 / 2
  float distMm = (duration * 0.343f) / 2.0f;
  if (distMm < 20.0f || distMm > 4500.0f) {
    return -1; // Reject deadband (<2cm) and extreme distances (>4.5m)
  }

  return (int32_t)distMm;
}

// Read acoustic sound level from LM393 analog pin
int16_t readSoundLevel() {
  const int NUM_SAMPLES = 64;
  uint32_t sum = 0;
  int minVal = 4095;
  int maxVal = 0;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    int val = analogRead(PIN_SOUND_ADC);
    sum += val;
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    delayMicroseconds(50);
  }

  int peakToPeak = maxVal - minVal;
  // Estimate approximate sound level relative to ambient baseline (40 - 110 dB)
  float db = 40.0f + (peakToPeak / 4095.0f) * 70.0f;
  return (int16_t)(db * 10.0f); // 0.1 dB resolution
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 2000);
  Serial.println(F("\n=================================================="));
  Serial.println(F("  ESP32 MINE-RESCUE FIELD NODE TELEMETRY FIRMWARE"));
  Serial.print(F("  Configured Node ID: "));
  Serial.println(NODE_ID);
  Serial.println(F("=================================================="));

  // Initialize GPIO pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_SOUND_ADC, INPUT);

  // Initialize IMU
  g_imuDetected = initMPU6500();

  // Initialize SPI and Ra-02 SX1278 LoRa
  SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_CS);
  LoRa.setPins(PIN_LORA_CS, PIN_LORA_RST, PIN_LORA_DIO0);

  Serial.print(F("[LoRa] Initializing on 433.0 MHz... "));
  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println(F("FAILED! Check wiring (NSS, RST, DIO0, SPI). Halting."));
    while (1) {
      delay(1000);
    }
  }

  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setTxPower(LORA_TX_POWER);
  LoRa.enableCrc();
  Serial.println(F("SUCCESS. Ready for telemetry broadcast."));
  Serial.print(F("[DIAGNOSTICS] Serialized Packet Size: "));
  Serial.print(MINE_PACKET_SIZE);
  Serial.println(F(" bytes"));
  Serial.print(F("[DIAGNOSTICS] IMU GY-6500: "));
  Serial.println(g_imuDetected ? F("ONLINE (0x68)") : F("DISCONNECTED"));
  Serial.println(F("[DIAGNOSTICS] Ultrasonic HC-SR04: Trig=4, Echo=16"));
  Serial.println(F("[DIAGNOSTICS] Acoustic LM393: ADC=34"));
  Serial.println(F("[DIAGNOSTICS] Battery Circuit: Monitored only if hardware divider present (default -1)"));
}

void loop() {
  unsigned long now = millis();
  if (now - g_lastTxTime < TELEMETRY_INTERVAL_MS) {
    delay(10);
    return;
  }
  g_lastTxTime = now;

  // Build telemetry packet
  MinePacket packet;
  memset(&packet, 0, sizeof(MinePacket));

  packet.magic[0] = 'M';
  packet.magic[1] = 'R';
  packet.version = PROTOCOL_VERSION;
  strncpy(packet.nodeId, NODE_ID, sizeof(packet.nodeId) - 1);
  packet.sequence = g_sequenceNumber++;
  packet.uptimeMs = now;
  packet.sensorFlags = 0;

  // 1. Sample IMU (MPU6500)
  float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
  if (g_imuDetected && readMPU6500(ax, ay, az, gx, gy, gz)) {
    packet.sensorFlags |= (FLAG_ACCEL_OK | FLAG_GYRO_OK);
    packet.accelX = (int16_t)(ax * 100.0f);
    packet.accelY = (int16_t)(ay * 100.0f);
    packet.accelZ = (int16_t)(az * 100.0f);
    packet.gyroX  = (int16_t)(gx * 10.0f);
    packet.gyroY  = (int16_t)(gy * 10.0f);
    packet.gyroZ  = (int16_t)(gz * 10.0f);
  } else {
    packet.accelX = -32768;
    packet.accelY = -32768;
    packet.accelZ = -32768;
    packet.gyroX  = -32768;
    packet.gyroY  = -32768;
    packet.gyroZ  = -32768;
  }

  // 2. Sample Ultrasonic Distance (HC-SR04)
  int32_t distMm = readHCSR04();
  if (distMm >= 0) {
    packet.sensorFlags |= FLAG_DIST_OK;
    packet.distanceMm = distMm;
  } else {
    packet.distanceMm = -1; // Sensor timeout or disconnected
  }

  // 3. Sample Acoustic Sound Level (LM393)
  int16_t soundDb10 = readSoundLevel();
  if (soundDb10 >= 0) {
    packet.sensorFlags |= FLAG_SOUND_OK;
    packet.acousticDb10 = soundDb10;
  } else {
    packet.acousticDb10 = -1;
  }

  // 4. Battery Level (Optional, -1 if no voltage divider connected)
  packet.batteryPct = -1;

  // 5. Serialize into explicit byte buffer (exactly 47 bytes)
  uint8_t txBuffer[MINE_PACKET_SIZE];
  packet.crc = 0;
  serializeMinePacket(packet, txBuffer);

  // 6. Compute CRC16-CCITT over first 45 bytes and place into bytes 45..46
  packet.crc = calculateCrc16(txBuffer, MINE_PACKET_SIZE - 2);
  txBuffer[45] = (uint8_t)(packet.crc >> 8);
  txBuffer[46] = (uint8_t)(packet.crc & 0xFF);

  // Transmit over LoRa
  LoRa.beginPacket();
  LoRa.write(txBuffer, MINE_PACKET_SIZE);
  LoRa.endPacket();

  // Output Human-Readable Serial Telemetry
  Serial.print(F("[TX] Node: "));
  Serial.print(packet.nodeId);
  Serial.print(F(" | Seq: #"));
  Serial.print(packet.sequence);
  Serial.print(F(" | Accel: ["));
  if (packet.sensorFlags & FLAG_ACCEL_OK) {
    Serial.print(ax, 2); Serial.print(F(", "));
    Serial.print(ay, 2); Serial.print(F(", "));
    Serial.print(az, 2); Serial.print(F("] m/s²"));
  } else {
    Serial.print(F("DISCONNECTED]"));
  }
  Serial.print(F(" | Dist: "));
  if (packet.sensorFlags & FLAG_DIST_OK) {
    Serial.print(distMm / 1000.0f, 3);
    Serial.print(F(" m"));
  } else {
    Serial.print(F("NO ECHO"));
  }
  Serial.print(F(" | Sound: "));
  if (packet.sensorFlags & FLAG_SOUND_OK) {
    Serial.print(soundDb10 / 10.0f, 1);
    Serial.print(F(" dB"));
  } else {
    Serial.print(F("NO DATA"));
  }
  Serial.print(F(" | Size: "));
  Serial.print(sizeof(MinePacket));
  Serial.println(F(" B"));
}
