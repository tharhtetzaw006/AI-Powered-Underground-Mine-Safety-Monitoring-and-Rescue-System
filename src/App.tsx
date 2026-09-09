import React, { useState, useMemo } from 'react';
import { LiveDataProvider, useLiveData } from './context/LiveDataContext.tsx';
import { Header } from './components/Header.tsx';
import { Sidebar, NavSection } from './components/Sidebar.tsx';
import { SystemHealthSummary } from './components/SystemHealthSummary.tsx';
import { DetectionSummary } from './components/DetectionSummary.tsx';
import { SensorTelemetryGrid } from './components/SensorTelemetryGrid.tsx';
import { LiveSignalChart } from './components/LiveSignalChart.tsx';
import { NodeStatusTable } from './components/NodeStatusTable.tsx';
import { AlertList, AlertItem } from './components/AlertList.tsx';
import { CameraSection } from './components/CameraSection.tsx';
import { SpatialView } from './components/SpatialView.tsx';
import { NodeSelector } from './components/NodeSelector.tsx';
import { NodeStatusBanner } from './components/NodeStatusBanner.tsx';
import { RawPacketInspector } from './components/RawPacketInspector.tsx';
import { SensorDiagnosticsPanel } from './components/SensorDiagnosticsPanel.tsx';
import { GatewayIngestionGuide } from './components/GatewayIngestionGuide.tsx';
import { SectionHeader } from './components/SectionHeader.tsx';
import { SIGNAL_CONFIG } from './config/signalProcessingConfig.ts';
import {
  Activity,
  Crosshair,
  Radio,
  ShieldAlert,
  Camera,
  Server,
  Terminal,
  LineChart,
  Compass,
} from 'lucide-react';

function DashboardMain() {
  const [showGatewayInfo, setShowGatewayInfo] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');

  const { nodes, activeTelemetry, connectionStatus, activeNodeId } = useLiveData();

  // Deterministically derive active alerts count for the sidebar badge
  const activeAlertCount = useMemo(() => {
    let count = 0;
    if (connectionStatus === 'ERROR' || connectionStatus === 'DISCONNECTED') count++;
    nodes.forEach((n) => {
      if (n.status === 'OFFLINE' || n.status === 'STALE') count++;
      if (n.battery !== null && n.battery <= 25) count++;
      if (n.packetLoss !== null && n.packetLoss >= 20) count++;
    });
    if (activeTelemetry) {
      if (
        activeTelemetry.distance !== null &&
        activeTelemetry.distance < SIGNAL_CONFIG.DISTANCE.CRITICAL_M
      ) {
        count++;
      }
      if (
        activeTelemetry.soundLevel !== null &&
        activeTelemetry.soundLevel > SIGNAL_CONFIG.ACOUSTIC.HIGH_MIN_DB
      ) {
        count++;
      }
    }
    return count;
  }, [nodes, activeTelemetry, connectionStatus]);

  return (
    <div className="h-screen w-full bg-[#000000] text-[#FFFFFF] flex flex-col font-mono overflow-hidden select-none">
      {/* Top Header */}
      <Header
        onToggleGatewayInfo={() => setShowGatewayInfo((prev) => !prev)}
        showGatewayInfo={showGatewayInfo}
      />

      {/* Gateway Ingestion Test / Specification Modal */}
      {showGatewayInfo && (
        <div className="w-full px-3 sm:px-4 pt-2.5 shrink-0 overflow-y-auto max-h-80 bg-[#000000] border-b border-[#222222] z-20">
          <GatewayIngestionGuide onClose={() => setShowGatewayInfo(false)} />
        </div>
      )}

      {/* Main Workspace with Edge-to-Edge Sidebar & Content */}
      <div className="flex-1 w-full flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <Sidebar
          id="command-sidebar"
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          alertCount={activeAlertCount}
        />

        {/* Dynamic Main Content Area - Full Screen Edge-to-Edge Scrollable */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* Node Selector Ribbon */}
          <NodeSelector />

          {/* Active Node Alert Ribbon (Stale / Offline warnings & subsystem status) */}
          <NodeStatusBanner />

          {/* Section: Overview (All 8 core modules in hierarchical command view) */}
          {activeSection === 'overview' && (
            <div className="space-y-3">
              {/* System Health */}
              <SystemHealthSummary id="section-system-health" />

              {/* Live Detection Summary */}
              <DetectionSummary id="section-detection" />

              {/* Sensor Telemetry Grid */}
              <div className="space-y-2">
                <SectionHeader
                  icon={Activity}
                  title="Live Sensor Telemetry"
                  subtitle={
                    activeNodeId
                      ? `REAL MEASUREMENTS FOR NODE [${activeNodeId}]`
                      : 'AWAITING NODE SELECTION'
                  }
                />
                <SensorTelemetryGrid id="section-sensors" />
              </div>

              {/* Live Signal Charts */}
              <div className="space-y-2">
                <SectionHeader
                  icon={LineChart}
                  title="Live Signal Telemetry Plotter"
                  subtitle="REAL HARDWARE TELEMETRY SAMPLES BUFFER"
                />
                <LiveSignalChart id="section-charts" />
              </div>

              {/* Node Monitoring */}
              <div className="space-y-2">
                <SectionHeader
                  icon={Radio}
                  title="Field Node Fleet Registry"
                  subtitle="RF LINK, POWER RESERVES, AND SENSOR STATUS"
                  badge={
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D0D0D] text-[#38BDF8] border border-[#222222]">
                      {nodes.length} NODES
                    </span>
                  }
                />
                <NodeStatusTable id="section-nodes" />
              </div>

              {/* Alerts */}
              <div className="space-y-2">
                <SectionHeader
                  icon={ShieldAlert}
                  title="Operational Alerts & Faults"
                  subtitle="DETERMINISTIC THRESHOLD & LINK MONITORING"
                  badge={
                    activeAlertCount > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f0505] text-[#EF4444] border border-[#6b1414]">
                        {activeAlertCount} ACTIVE
                      </span>
                    ) : undefined
                  }
                />
                <AlertList id="section-alerts" />
              </div>

              {/* Optical Surveillance (Camera) & Spatial Environment */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <CameraSection id="section-camera" />
                <SpatialView id="section-spatial" />
              </div>

              {/* Hardware Validation & Sensor Diagnostics */}
              <SensorDiagnosticsPanel id="section-diagnostics" />

              {/* Raw Ingestion Packet Buffer */}
              <RawPacketInspector />
            </div>
          )}

          {/* Section: Live Sensors Focused View */}
          {activeSection === 'sensors' && (
            <div className="space-y-3">
              <SectionHeader
                icon={Activity}
                title="Live Sensor Telemetry"
                subtitle={`INSPECTION FOR ACTIVE TARGET [${activeNodeId ?? 'NONE'}]`}
              />
              <SensorTelemetryGrid />
              <LiveSignalChart />
            </div>
          )}

          {/* Section: Detection Focused View */}
          {activeSection === 'detection' && (
            <div className="space-y-3">
              <SectionHeader
                icon={Crosshair}
                title="Live Detection & Localization"
                subtitle="ACOUSTIC / IMU CLASSIFICATION & SPATIAL ENVIRONMENT"
              />
              <DetectionSummary />
              <SpatialView />
            </div>
          )}

          {/* Section: Nodes Focused View */}
          {activeSection === 'nodes' && (
            <div className="space-y-3">
              <SectionHeader
                icon={Radio}
                title="Field Rescue Nodes Monitoring"
                subtitle="ACTIVE RF SENSORY NODES STATUS & RECEPTION"
              />
              <NodeStatusTable />
            </div>
          )}

          {/* Section: Alerts Focused View */}
          {activeSection === 'alerts' && (
            <div className="space-y-3">
              <SectionHeader
                icon={ShieldAlert}
                title="Alerts & Fault Timeline"
                subtitle="SYSTEM ANOMALIES, RF TIMEOUTS, AND BATTERY DEVIATIONS"
              />
              <AlertList />
            </div>
          )}

          {/* Section: Camera Focused View */}
          {activeSection === 'camera' && (
            <div className="space-y-3">
              <SectionHeader
                icon={Camera}
                title="Optical Camera Stream"
                subtitle="ESP32-CAM MJPEG / RTSP TRANSMISSION BUS"
              />
              <CameraSection />
            </div>
          )}

          {/* Section: System Focused View */}
          {activeSection === 'system' && (
            <div className="space-y-3">
              <SectionHeader
                icon={Server}
                title="System Operational Health & Ingestion Diagnostic"
                subtitle="GATEWAY WEBSOCKET LINK, SENSOR DIAGNOSTICS & RAW TELEMETRY LOGS"
              />
              <SystemHealthSummary />
              <SensorDiagnosticsPanel />
              <RawPacketInspector />
            </div>
          )}
        </main>
      </div>

      {/* Command Status Bar Footer - Full Width Edge-to-Edge */}
      <footer className="bg-[#080808] border-t border-[#222222] px-3 sm:px-4 py-2 text-[11px] text-[#8A8A8A] flex flex-col sm:flex-row items-center justify-between gap-2 w-full shrink-0">
        <div>
          MINE-RESCUE OPERATIONS MONITOR &bull; RIG PROTOCOL REST/WS &bull; HARDWARE DECOUPLED
        </div>
        <div className="flex items-center gap-3">
          <span>TRANSPORT: <strong className="text-[#FFFFFF]">{connectionStatus}</strong></span>
          <span>NODES: <strong className="text-[#22C55E]">{nodes.length}</strong></span>
          <span>ALERTS: <strong className={activeAlertCount > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}>{activeAlertCount}</strong></span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LiveDataProvider>
      <DashboardMain />
    </LiveDataProvider>
  );
}
