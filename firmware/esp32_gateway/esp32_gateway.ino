/*
 * MINE-RESCUE OPERATIONS MONITOR - ESP32 LoRa GATEWAY FIRMWARE
 * 
 * Hardware:
 *   - ESP32 DevKit / ESP32-WROOM
 *   - Ra-02 SX1278 LoRa Module (433MHz SPI)
 *   - Wi-Fi / Ethernet connection to Dashboard Backend
 * 
 * Functional Pipeline:
 *   1. Listens for LoRa RF packets from ANY field node (NODE-01, NODE-02, NODE-03, etc.)
 *   2. Validates packet length, protocol version, and CRC16 checksum
 *   3. Reads real physical RF metrics (RSSI in dBm, SNR in dB)
 *   4. Packages telemetry into clean JSON payload
 *   5. Forwards immediately via HTTP POST to /api/telemetry on Node.js backend
 */

#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ================= NETWORK & INGESTION CONFIGURATION =================
// 1. Wi-Fi network credentials for local router / hotspot
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// 2. Target laptop/server LAN IP & Port running Node.js backend (:3000)
//    Find your computer's LAN IP with:
//      Windows: ipconfig
//      Linux:   hostname -I
//      macOS:   ipconfig getifaddr en0
#define BACKEND_HOST "192.168.1.100"
#define BACKEND_PORT 3000
const char* TELEMETRY_PATH = "/api/telemetry";

// LoRa RF Settings (Ra-02 SX1278 - Must match Field Nodes exactly)
#define LORA_FREQUENCY 433E6
#define LORA_SYNC_WORD 0x12
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH 125E3

// Pin Definitions for Ra-02 LoRa
#define PIN_LORA_SCK  18
#define PIN_LORA_MISO 19
#define PIN_LORA_MOSI 23
#define PIN_LORA_CS   5
#define PIN_LORA_RST  14
#define PIN_LORA_DIO0 2

// LED Status Indicator
#define PIN_STATUS_LED 2

// ================= PACKET PROTOCOL (Identical to Field Node) =================
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

// Explicit byte deserialization avoiding any compiler padding discrepancy
bool deserializeMinePacket(const uint8_t *buf, size_t len, MinePacket &pkt) {
  if (len != MINE_PACKET_SIZE) return false;
  pkt.magic[0] = (char)buf[0];
  pkt.magic[1] = (char)buf[1];
  pkt.version = buf[2];
  memset(pkt.nodeId, 0, 16);
  memcpy(pkt.nodeId, &buf[3], 15);
  pkt.nodeId[15] = '\0';
  pkt.sequence = ((uint16_t)buf[19] << 8) | (uint16_t)buf[20];
  pkt.uptimeMs = ((uint32_t)buf[21] << 24) | ((uint32_t)buf[22] << 16) |
                 ((uint32_t)buf[23] << 8) | (uint32_t)buf[24];
  pkt.sensorFlags = buf[25];
  pkt.accelX = (int16_t)(((uint16_t)buf[26] << 8) | (uint16_t)buf[27]);
  pkt.accelY = (int16_t)(((uint16_t)buf[28] << 8) | (uint16_t)buf[29]);
  pkt.accelZ = (int16_t)(((uint16_t)buf[30] << 8) | (uint16_t)buf[31]);
  pkt.gyroX = (int16_t)(((uint16_t)buf[32] << 8) | (uint16_t)buf[33]);
  pkt.gyroY = (int16_t)(((uint16_t)buf[34] << 8) | (uint16_t)buf[35]);
  pkt.gyroZ = (int16_t)(((uint16_t)buf[36] << 8) | (uint16_t)buf[37]);
  pkt.distanceMm = (int32_t)(((uint32_t)buf[38] << 24) | ((uint32_t)buf[39] << 16) |
                             ((uint32_t)buf[40] << 8) | (uint32_t)buf[41]);
  pkt.acousticDb10 = (int16_t)(((uint16_t)buf[42] << 8) | (uint16_t)buf[43]);
  pkt.batteryPct = (int8_t)buf[44];
  pkt.crc = ((uint16_t)buf[45] << 8) | (uint16_t)buf[46];
  return true;
}

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

// Wi-Fi Connection Manager
void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print(F("[Wi-Fi] Reconnecting to "));
  Serial.print(WIFI_SSID);
  Serial.print(F("... "));
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(F("."));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F(" CONNECTED"));
    Serial.print(F("[Wi-Fi] Gateway IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F(" TIMEOUT. Will retry on next packet."));
  }
}

// Forward parsed packet to Node.js backend
bool forwardTelemetryToBackend(const MinePacket &packet, int rssi, float snr, size_t rawPacketSize) {
  if (WiFi.status() != WL_CONNECTED) {
    ensureWiFiConnected();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[HTTP] Dropped forward: Wi-Fi offline"));
      return false;
    }
  }

  // Construct JSON Payload strictly using real data (never fake values)
  String json = "{";
  json += "\"nodeId\":\"" + String(packet.nodeId) + "\",";
  json += "\"sequenceNumber\":" + String(packet.sequence) + ",";
  json += "\"deviceTimestamp\":" + String(packet.uptimeMs) + ",";
  json += "\"rssi\":" + String(rssi) + ",";
  json += "\"snr\":" + String(snr, 1) + ",";
  json += "\"payloadSize\":" + String(rawPacketSize) + ",";

  // Accelerometer
  if (packet.sensorFlags & FLAG_ACCEL_OK) {
    json += "\"acceleration\":{";
    json += "\"x\":" + String(packet.accelX / 100.0f, 2) + ",";
    json += "\"y\":" + String(packet.accelY / 100.0f, 2) + ",";
    json += "\"z\":" + String(packet.accelZ / 100.0f, 2) + "},";
  } else {
    json += "\"acceleration\":null,";
  }

  // Gyroscope
  if (packet.sensorFlags & FLAG_GYRO_OK) {
    json += "\"gyroscope\":{";
    json += "\"x\":" + String(packet.gyroX / 10.0f, 1) + ",";
    json += "\"y\":" + String(packet.gyroY / 10.0f, 1) + ",";
    json += "\"z\":" + String(packet.gyroZ / 10.0f, 1) + "},";
  } else {
    json += "\"gyroscope\":null,";
  }

  // Distance (in meters)
  if ((packet.sensorFlags & FLAG_DIST_OK) && packet.distanceMm >= 0) {
    json += "\"distance\":" + String(packet.distanceMm / 1000.0f, 3) + ",";
  } else {
    json += "\"distance\":null,";
  }

  // Sound Level (dB)
  if ((packet.sensorFlags & FLAG_SOUND_OK) && packet.acousticDb10 >= 0) {
    json += "\"soundLevel\":" + String(packet.acousticDb10 / 10.0f, 1) + ",";
    json += "\"acoustic\":" + String(packet.acousticDb10 / 10.0f, 1) + ",";
  } else {
    json += "\"soundLevel\":null,";
    json += "\"acoustic\":null,";
  }

  // Battery
  if ((packet.sensorFlags & FLAG_BATT_OK) && packet.batteryPct >= 0) {
    json += "\"battery\":" + String(packet.batteryPct) + ",";
  } else {
    json += "\"battery\":null,";
  }

  // Null packetLoss so backend computes it deterministically from 16-bit sequence gaps
  json += "\"packetLoss\":null";
  json += "}";

  String serverUrl = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + String(TELEMETRY_PATH);

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);

  int httpCode = http.POST(json);
  bool success = (httpCode == 200 || httpCode == 201 || httpCode == 204);

  if (success) {
    Serial.print(F("[HTTP 200] Forwarded to backend ("));
    Serial.print(json.length());
    Serial.println(F(" bytes)"));
  } else {
    Serial.print(F("[HTTP ERROR] Target: "));
    Serial.print(serverUrl);
    Serial.print(F(" | Code: "));
    Serial.print(httpCode);
    Serial.print(F(" - "));
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return success;
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 2000);

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  Serial.println(F("\n=================================================="));
  Serial.println(F("  ESP32 MINE-RESCUE MULTI-NODE LoRa GATEWAY"));
  Serial.println(F("=================================================="));
  Serial.print(F("[CONFIG] Wi-Fi SSID: ")); Serial.println(WIFI_SSID);
  Serial.print(F("[CONFIG] Backend Target: http://"));
  Serial.print(BACKEND_HOST); Serial.print(F(":")); Serial.print(BACKEND_PORT); Serial.println(TELEMETRY_PATH);
  Serial.print(F("[CONFIG] Expected Packet Size: ")); Serial.print(MINE_PACKET_SIZE); Serial.println(F(" B"));

  // Connect to Wi-Fi
  ensureWiFiConnected();

  // Initialize SPI and Ra-02 SX1278 LoRa
  SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_CS);
  LoRa.setPins(PIN_LORA_CS, PIN_LORA_RST, PIN_LORA_DIO0);

  Serial.print(F("[LoRa] Initializing receiver on 433.0 MHz... "));
  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println(F("FAILED! Check SPI & GPIO pins. Halting."));
    while (1) {
      delay(1000);
    }
  }

  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.enableCrc();
  Serial.println(F("SUCCESS. Listening for all field node transmissions."));
}

void loop() {
  // Check for incoming LoRa packet
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) {
    return;
  }

  digitalWrite(PIN_STATUS_LED, HIGH);

  // 1. Validate exact serialized packet length (47 bytes)
  if (packetSize != MINE_PACKET_SIZE) {
    Serial.print(F("[LoRa REJECT] Invalid packet size: "));
    Serial.print(packetSize);
    Serial.print(F(" B (expected "));
    Serial.print(MINE_PACKET_SIZE);
    Serial.println(F(" B)"));
    while (LoRa.available()) LoRa.read(); // Flush corrupted packet
    digitalWrite(PIN_STATUS_LED, LOW);
    return;
  }

  // Read raw bytes into dedicated buffer
  uint8_t rxBuffer[MINE_PACKET_SIZE];
  LoRa.readBytes(rxBuffer, MINE_PACKET_SIZE);

  // 2. Validate magic bytes ('M', 'R') and protocol version
  if (rxBuffer[0] != 'M' || rxBuffer[1] != 'R' || rxBuffer[2] != PROTOCOL_VERSION) {
    Serial.println(F("[LoRa REJECT] Protocol header mismatch (expected MR v0x01)"));
    digitalWrite(PIN_STATUS_LED, LOW);
    return;
  }

  // 3. Validate CRC16 checksum over bytes 0..44
  uint16_t receivedCrc = ((uint16_t)rxBuffer[45] << 8) | (uint16_t)rxBuffer[46];
  uint16_t expectedCrc = calculateCrc16(rxBuffer, MINE_PACKET_SIZE - 2);
  if (receivedCrc != expectedCrc) {
    Serial.print(F("[LoRa REJECT] CRC mismatch: Got 0x"));
    Serial.print(receivedCrc, HEX);
    Serial.print(F(" Expected 0x"));
    Serial.println(expectedCrc, HEX);
    digitalWrite(PIN_STATUS_LED, LOW);
    return;
  }

  // 4. Deserialize into typed packet struct
  MinePacket packet;
  if (!deserializeMinePacket(rxBuffer, MINE_PACKET_SIZE, packet)) {
    Serial.println(F("[LoRa REJECT] Deserialization failure"));
    digitalWrite(PIN_STATUS_LED, LOW);
    return;
  }

  // Ensure null-termination of nodeId string
  packet.nodeId[sizeof(packet.nodeId) - 1] = '\0';

  // Read actual physical RF metrics from SX1278
  int rssi = LoRa.packetRssi();
  float snr = LoRa.packetSnr();

  // Human-Readable Serial Log
  Serial.print(F("[LoRa RX] Node: "));
  Serial.print(packet.nodeId);
  Serial.print(F(" | Seq: #"));
  Serial.print(packet.sequence);
  Serial.print(F(" | RSSI: "));
  Serial.print(rssi);
  Serial.print(F(" dBm | SNR: "));
  Serial.print(snr, 1);
  Serial.print(F(" dB | Flags: 0x"));
  Serial.println(packet.sensorFlags, HEX);

  // 4. Forward packet to backend
  forwardTelemetryToBackend(packet, rssi, snr, (size_t)packetSize);

  digitalWrite(PIN_STATUS_LED, LOW);
}
