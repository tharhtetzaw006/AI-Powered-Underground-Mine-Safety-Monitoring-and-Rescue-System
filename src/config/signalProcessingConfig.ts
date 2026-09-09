/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Deterministic Signal Processing Engineering Configuration.
 * Centralized location for all rolling window sizes, physical constants,
 * proximity boundaries, and signal activity thresholds.
 * 
 * NOTE: These are engineering configuration parameters and thresholds
 * until calibrated against real mine-rescue physical hardware measurements.
 */

export const SIGNAL_CONFIG = {
  /** Rolling window capacity of genuine telemetry samples per node */
  ROLLING_WINDOW_SIZE: 20,

  /** Minimum samples required before computing statistical variance/means */
  MIN_SAMPLES_FOR_VARIANCE: 3,

  /** Standard gravitational acceleration constant in m/s² (1g) */
  GRAVITY_STANDARD: 9.80665,

  /** Sensor staleness threshold in milliseconds (10 seconds) */
  STALENESS_THRESHOLD_MS: 10000,

  /** HC-SR04 Proximity engineering boundaries in meters */
  DISTANCE: {
    CRITICAL_M: 1.0, // Obstacle within 1.0m
    CAUTION_M: 2.5,  // Obstacle within 2.5m
  },

  /** Acoustic sound pressure level thresholds in dB SPL */
  ACOUSTIC: {
    QUIET_MAX_DB: 50.0,
    MODERATE_MAX_DB: 70.0,
    ELEVATED_MAX_DB: 85.0,
    HIGH_MIN_DB: 85.0,
  },

  /**
   * Deterministic Motion Index thresholds (dimensionless).
   * Metric represents measured kinetic signal activity:
   * Dynamic linear acceleration deviation + scaled angular rate magnitude.
   * NOTE: This represents SENSOR ACTIVITY, NOT human presence.
   */
  MOTION_INDEX: {
    QUIET_MAX: 0.35,
    LOW_MAX: 1.5,
    ELEVATED_MAX: 4.0,
    HIGH_MIN: 4.0,
  },

  /** Rate of change time threshold in seconds to avoid divide-by-zero */
  MIN_TIME_DELTA_SECONDS: 0.01,

  /** RF Link Quality thresholds based on RSSI (dBm) and Packet Loss (%) */
  RF: {
    GOOD_MIN_RSSI: -75,
    DEGRADED_MIN_RSSI: -90,
    POOR_MAX_LOSS: 20, // > 20% loss is POOR
  },

  /** Battery State thresholds (%) */
  BATTERY: {
    CRITICAL_MAX: 15,
    LOW_MAX: 30,
  },
} as const;
