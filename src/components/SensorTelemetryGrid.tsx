import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { MetricCard } from './MetricCard.tsx';
import { SensorMetric } from './SensorMetric.tsx';
import {
  Compass,
  Gauge,
  Ruler,
  Volume2,
  Wifi,
  Percent,
  Battery,
  Zap,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface SensorTelemetryGridProps {
  id?: string;
}

export const SensorTelemetryGrid: React.FC<SensorTelemetryGridProps> = ({ id }) => {
  const { activeTelemetry, activeNodeId, nodes, activeDerivedMetrics } = useLiveData();

  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);
  const acc = activeTelemetry?.acceleration;
  const gyro = activeTelemetry?.gyroscope;
  const dist = activeTelemetry?.distance;
  const sound = activeTelemetry?.soundLevel;
  const rssi = activeTelemetry?.rssi;
  const loss = activeTelemetry?.packetLoss;
  const batt = activeTelemetry?.battery;

  const metrics = activeDerivedMetrics;

  // IMU status calculation
  const imuStatus =
    activeNode?.sensorHealth.imu ??
    (acc || gyro ? 'HEALTHY' : activeNodeId ? 'UNKNOWN' : 'NO DATA');

  // Proximity status calculation
  let distStatus: string = 'NORMAL';
  if (dist === null || dist === undefined) {
    distStatus = activeNodeId ? 'UNKNOWN' : 'NO DATA';
  } else if (dist < 1.0) {
    distStatus = 'CRITICAL';
  } else if (dist < 2.5) {
    distStatus = 'DEGRADED';
  }

  // Acoustic status
  let soundStatus: string = 'NORMAL';
  if (sound === null || sound === undefined) {
    soundStatus = activeNodeId ? 'UNKNOWN' : 'NO DATA';
  } else if (sound > 90) {
    soundStatus = 'CRITICAL';
  } else if (sound > 75) {
    soundStatus = 'DEGRADED';
  }

  // RSSI status
  let rssiStatus: string = 'NORMAL';
  if (rssi === null || rssi === undefined) {
    rssiStatus = activeNodeId ? 'UNKNOWN' : 'NO DATA';
  } else if (rssi < -95) {
    rssiStatus = 'CRITICAL';
  } else if (rssi < -80) {
    rssiStatus = 'DEGRADED';
  }

  // Battery status
  let battStatus: string = 'NORMAL';
  if (batt === null || batt === undefined) {
    battStatus = activeNodeId ? 'UNKNOWN' : 'NO DATA';
  } else if (batt <= 15) {
    battStatus = 'CRITICAL';
  } else if (batt <= 30) {
    battStatus = 'DEGRADED';
  }

  return (
    <div id={id} className="space-y-3 font-mono">
      {/* Top 2 Multi-Axis Panels: Accelerometer & Gyroscope */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Accelerometer */}
        <div className="border border-[#222222] bg-[#080808] rounded p-3.5">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#222222]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#38BDF8]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                Accelerometer (3-Axis)
              </h3>
            </div>
            <StatusBadge status={imuStatus} size="xs" />
          </div>

          <div className="space-y-1.5">
            <SensorMetric
              axis="X"
              label="Lateral Acceleration"
              value={acc?.x}
              unit="m/s²"
              signed
            />
            <SensorMetric
              axis="Y"
              label="Longitudinal Acceleration"
              value={acc?.y}
              unit="m/s²"
              signed
            />
            <SensorMetric
              axis="Z"
              label="Vertical Acceleration"
              value={acc?.z}
              unit="m/s²"
              signed
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] pt-2 mt-2 border-t border-[#222222]">
            <span className="flex items-center gap-1.5">
              <span>MAGNITUDE |a|:</span>
              <strong className={metrics?.accelerationMagnitude !== null && metrics?.accelerationMagnitude !== undefined ? 'text-[#38BDF8]' : 'text-[#8A8A8A]'}>
                {metrics?.accelerationMagnitude !== null && metrics?.accelerationMagnitude !== undefined
                  ? `${metrics.accelerationMagnitude.toFixed(2)} m/s²`
                  : 'NO DATA'}
              </strong>
            </span>
            <span>
              VARIANCE: {metrics?.accelMagVariance !== null && metrics?.accelMagVariance !== undefined ? `${metrics.accelMagVariance.toFixed(3)}` : '--'}
            </span>
          </div>
        </div>

        {/* Gyroscope */}
        <div className="border border-[#222222] bg-[#080808] rounded p-3.5">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#222222]">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#38BDF8]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                Gyroscope (Angular Rate)
              </h3>
            </div>
            <StatusBadge status={imuStatus} size="xs" />
          </div>

          <div className="space-y-1.5">
            <SensorMetric
              axis="X"
              label="Roll Rate"
              value={gyro?.x}
              unit="°/s"
              signed
            />
            <SensorMetric
              axis="Y"
              label="Pitch Rate"
              value={gyro?.y}
              unit="°/s"
              signed
            />
            <SensorMetric
              axis="Z"
              label="Yaw Rate"
              value={gyro?.z}
              unit="°/s"
              signed
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] pt-2 mt-2 border-t border-[#222222]">
            <span className="flex items-center gap-1.5">
              <span>MAGNITUDE |ω|:</span>
              <strong className={metrics?.gyroscopeMagnitude !== null && metrics?.gyroscopeMagnitude !== undefined ? 'text-[#22C55E]' : 'text-[#8A8A8A]'}>
                {metrics?.gyroscopeMagnitude !== null && metrics?.gyroscopeMagnitude !== undefined
                  ? `${metrics.gyroscopeMagnitude.toFixed(2)} °/s`
                  : 'NO DATA'}
              </strong>
            </span>
            <span>
              VARIANCE: {metrics?.gyroMagVariance !== null && metrics?.gyroMagVariance !== undefined ? `${metrics.gyroMagVariance.toFixed(3)}` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Discrete Measurements Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Distance */}
        <MetricCard
          title="Distance"
          value={dist !== null && dist !== undefined ? dist.toFixed(2) : null}
          unit="m"
          source="HC-SR04 PROXIMITY"
          status={distStatus}
          icon={Ruler}
          detail={dist !== null && dist < 1.0 ? 'CRITICAL PROXIMITY' : dist !== null && dist < 2.5 ? 'CAUTION PROXIMITY' : 'CLEAR'}
        />

        {/* Sound Level */}
        <MetricCard
          title="Sound Level"
          value={sound !== null && sound !== undefined ? sound.toFixed(1) : null}
          unit="dB SPL"
          source="ACOUSTIC TRANSDUCER"
          status={soundStatus}
          icon={Volume2}
          detail={sound !== null && sound > 85 ? 'HIGH NOISE' : 'NOMINAL'}
        />

        {/* RSSI */}
        <MetricCard
          title="RSSI Signal"
          value={rssi !== null && rssi !== undefined ? rssi.toString() : null}
          unit="dBm"
          source="LORA RF TRANSCEIVER"
          status={rssiStatus}
          icon={Wifi}
          detail={rssi !== null && rssi >= -75 ? 'EXCELLENT LINK' : 'MARGINAL'}
        />

        {/* Packet Loss */}
        <MetricCard
          title="Packet Loss"
          value={loss !== null && loss !== undefined ? loss.toFixed(1) : null}
          unit="%"
          source="RF SEQUENCE MONITOR"
          status={loss !== null && loss > 15 ? 'DEGRADED' : 'NORMAL'}
          icon={Percent}
          detail={loss !== null && loss === 0 ? 'ZERO DROPS' : undefined}
        />

        {/* Battery */}
        <MetricCard
          title="Battery Reserve"
          value={batt !== null && batt !== undefined ? batt.toFixed(0) : null}
          unit="%"
          source="BMS COULOMB COUNTER"
          status={battStatus}
          icon={Battery}
          detail={batt !== null && batt <= 20 ? 'RECHARGE SOON' : 'NORMAL'}
        />
      </div>

      {/* Deterministic Real Signal Features & Sensor Activity Row */}
      <div className="border border-[#222222] bg-[#080808] rounded p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
              Deterministic Signal Processing & Sensor Activity
            </h3>
          </div>
          <span className="text-[10px] text-[#8A8A8A]">
            WINDOW: {metrics?.sampleCount ?? 0} SAMPLES | PHYSICAL MEASUREMENTS ONLY
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Motion Index */}
          <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
            <div className="text-[10px] text-[#B3B3B3] uppercase">Motion Index</div>
            <div className="mt-1 text-base sm:text-lg font-bold">
              {metrics?.motionIndex !== null && metrics?.motionIndex !== undefined ? (
                <span className="text-[#38BDF8]">{metrics.motionIndex.toFixed(3)}</span>
              ) : (
                <span className="text-[#8A8A8A] text-sm">NO DATA</span>
              )}
            </div>
            <div className="text-[9px] text-[#8A8A8A] mt-0.5">
              DYNAMIC ACCEL + ANGULAR RATE
            </div>
          </div>

          {/* Acoustic Activity */}
          <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
            <div className="text-[10px] text-[#B3B3B3] uppercase">Acoustic Activity</div>
            <div className="mt-1 text-base sm:text-lg font-bold">
              {metrics?.currentSoundLevel !== null && metrics?.currentSoundLevel !== undefined ? (
                <span className="text-[#F59E0B]">{metrics.currentSoundLevel.toFixed(1)} dB</span>
              ) : (
                <span className="text-[#8A8A8A] text-sm">NO DATA</span>
              )}
            </div>
            <div className="text-[9px] text-[#8A8A8A] mt-0.5">
              {metrics?.rollingSoundMean !== null && metrics?.rollingSoundMean !== undefined
                ? `ROLLING MEAN: ${metrics.rollingSoundMean.toFixed(1)} dB`
                : 'NO DATA'}
            </div>
          </div>

          {/* Distance Change */}
          <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
            <div className="text-[10px] text-[#B3B3B3] uppercase">Distance Delta</div>
            <div className="mt-1 text-base sm:text-lg font-bold">
              {metrics?.distanceDelta !== null && metrics?.distanceDelta !== undefined ? (
                <span className={metrics.distanceDelta < 0 ? 'text-[#EF4444]' : 'text-[#FFFFFF]'}>
                  {metrics.distanceDelta > 0 ? `+${metrics.distanceDelta.toFixed(2)}` : metrics.distanceDelta.toFixed(2)} m
                </span>
              ) : (
                <span className="text-[#8A8A8A] text-sm">NO DATA</span>
              )}
            </div>
            <div className="text-[9px] text-[#8A8A8A] mt-0.5">
              PROXIMITY: {metrics?.proximityCondition || 'NO DATA'}
            </div>
          </div>

          {/* Sensor Quality */}
          <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
            <div className="text-[10px] text-[#B3B3B3] uppercase">Sensor Quality</div>
            <div className="mt-1 text-base sm:text-lg font-bold">
              {metrics?.sensorQuality === 'HEALTHY' ? (
                <span className="text-[#22C55E]">HEALTHY</span>
              ) : metrics?.sensorQuality === 'DEGRADED' ? (
                <span className="text-[#F59E0B]">DEGRADED</span>
              ) : metrics?.sensorQuality === 'ERROR' ? (
                <span className="text-[#EF4444]">ERROR</span>
              ) : (
                <span className="text-[#8A8A8A] text-sm">NO DATA</span>
              )}
            </div>
            <div className="text-[9px] text-[#8A8A8A] mt-0.5">
              SIGNAL INTEGRITY STATE
            </div>
          </div>

          {/* Activity State */}
          <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
            <div className="text-[10px] text-[#B3B3B3] uppercase">Sensor Activity State</div>
            <div className="mt-1 text-base sm:text-lg font-bold">
              {metrics?.activityState === 'HIGH ACTIVITY' ? (
                <span className="text-[#EF4444]">HIGH ACTIVITY</span>
              ) : metrics?.activityState === 'ELEVATED ACTIVITY' ? (
                <span className="text-[#F59E0B]">ELEVATED</span>
              ) : metrics?.activityState === 'LOW ACTIVITY' ? (
                <span className="text-[#38BDF8]">LOW ACTIVITY</span>
              ) : metrics?.activityState === 'QUIET' ? (
                <span className="text-[#22C55E]">QUIET</span>
              ) : (
                <span className="text-[#8A8A8A] text-sm">NO DATA</span>
              )}
            </div>
            <div className="text-[9px] text-[#8A8A8A] mt-0.5">
              SIGNAL EXCITATION ONLY
            </div>
          </div>
        </div>

        <div className="text-[10px] text-[#8A8A8A] mt-2 pt-2 border-t border-[#222222]">
          NOTE: HC-SR04 monitored strictly as obstacle proximity. Motion Index and Acoustic Activity represent measured physical sensor excitation, NOT human presence.
        </div>
      </div>
    </div>
  );
};
