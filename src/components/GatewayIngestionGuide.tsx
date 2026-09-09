import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Terminal, Send, CheckCircle2, AlertTriangle, X, RefreshCw, Trash2 } from 'lucide-react';

interface GatewayIngestionGuideProps {
  onClose: () => void;
}

export const GatewayIngestionGuide: React.FC<GatewayIngestionGuideProps> = ({ onClose }) => {
  const { sendManualPacket, refresh } = useLiveData();
  const [seqInput, setSeqInput] = useState(1);
  const [testPayload, setTestPayload] = useState<string>(
    JSON.stringify(
      {
        nodeId: 'RESCUE-01',
        timestamp: Date.now(),
        acceleration: { x: 0.12, y: -0.04, z: 9.81 },
        gyroscope: { x: 0.05, y: -0.11, z: 0.02 },
        distance: 14.85,
        soundLevel: 68.4,
        rssi: -72,
        packetLoss: 0.5,
        battery: 88,
        sequenceNumber: 1,
      },
      null,
      2
    )
  );

  const [responseStatus, setResponseStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendTestPacket = async () => {
    setIsSubmitting(true);
    setResponseStatus(null);
    try {
      const parsed = JSON.parse(testPayload);
      const res = await sendManualPacket(parsed);
      setResponseStatus(res);
      if (res.success) {
        const nextSeq = (parsed.sequenceNumber || seqInput) + 1;
        setSeqInput(nextSeq);
        const updated = {
          ...parsed,
          timestamp: Date.now(),
          sequenceNumber: nextSeq,
        };
        setTestPayload(JSON.stringify(updated, null, 2));
      }
    } catch (err) {
      setResponseStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Invalid JSON payload format',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearNodes = async () => {
    if (!confirm('Clear all registered hardware nodes from server registry?')) return;
    try {
      await fetch('/api/nodes/clear', { method: 'POST' });
      await refresh();
      setResponseStatus({ success: true, message: 'Node registry cleared.' });
    } catch {
      setResponseStatus({ success: false, message: 'Failed to clear registry.' });
    }
  };

  return (
    <div className="bg-[#080808] border border-[#222222] rounded p-4 font-mono text-[#FFFFFF]">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FFFFFF]">
            ESP32 / LoRa Hardware Gateway Integration
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-[#B3B3B3] hover:text-[#FFFFFF] hover:bg-[#0D0D0D] rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hardware Specifications */}
        <div className="space-y-3 text-xs">
          <div className="bg-[#000000] p-3 rounded border border-[#222222]">
            <h4 className="font-bold text-[#38BDF8] mb-1">Ingestion Endpoint</h4>
            <div className="bg-[#0D0D0D] px-2.5 py-1.5 rounded border border-[#222222] text-[#22C55E] font-mono text-[11px] select-all">
              POST /api/telemetry
            </div>
            <p className="text-[11px] text-[#B3B3B3] mt-1.5 leading-relaxed">
              Send single JSON packet or array of packets. Server attaches <code className="text-[#38BDF8]">serverReceiveTime</code>, validates numbers, prevents null-to-zero conversion, and broadcasts via WebSocket.
            </p>
          </div>

          <div className="bg-[#000000] p-3 rounded border border-[#222222]">
            <h4 className="font-bold text-[#38BDF8] mb-1">Node Health Determinism</h4>
            <ul className="text-[11px] text-[#B3B3B3] space-y-1 list-disc list-inside">
              <li><strong className="text-[#22C55E]">ONLINE:</strong> Valid telemetry received within last 10s.</li>
              <li><strong className="text-[#F59E0B]">STALE:</strong> No telemetry received between 10s and 30s.</li>
              <li><strong className="text-[#EF4444]">OFFLINE:</strong> No telemetry received for over 30s.</li>
              <li>Missing sensor fields are preserved strictly as <strong className="text-[#FFFFFF]">null</strong> (&quot;--&quot; / &quot;NO DATA&quot;).</li>
            </ul>
          </div>

          <div className="bg-[#000000] p-3 rounded border border-[#222222]">
            <h4 className="font-bold text-[#38BDF8] mb-1">cURL Hardware Test Snippet</h4>
            <pre className="bg-[#0D0D0D] p-2 rounded border border-[#222222] text-[10px] text-[#B3B3B3] overflow-x-auto select-all whitespace-pre">
{`curl -X POST /api/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "nodeId": "RESCUE-01",
    "timestamp": ${Date.now()},
    "acceleration": {"x": 0.12, "y": -0.05, "z": 9.81},
    "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
    "distance": 8.45,
    "soundLevel": 58.2,
    "rssi": -65,
    "packetLoss": 0.0,
    "battery": 92
  }'`}
            </pre>
          </div>
        </div>

        {/* Live Hardware Ingestion Tester */}
        <div className="bg-[#000000] p-3.5 rounded border border-[#222222] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#38BDF8] flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                Live Ingestion Packet Injector
              </span>
              <button
                type="button"
                onClick={handleClearNodes}
                className="text-[10px] text-[#EF4444] hover:text-[#EF4444]/80 flex items-center gap-1"
                title="Clear Node Registry"
              >
                <Trash2 className="w-3 h-3" />
                CLEAR NODES
              </button>
            </div>

            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={10}
              className="w-full bg-[#0D0D0D] border border-[#222222] rounded p-2 text-xs font-mono text-[#FFFFFF] focus:border-[#38BDF8] focus:outline-none resize-none"
              placeholder="JSON telemetry payload"
            />
          </div>

          <div className="mt-3 space-y-2">
            {responseStatus && (
              <div
                className={`p-2 rounded text-xs border flex items-center gap-1.5 ${
                  responseStatus.success
                    ? 'bg-[#071a0e] text-[#22C55E] border-[#1b4d29]'
                    : 'bg-[#1f0505] text-[#EF4444] border-[#6b1414]'
                }`}
              >
                {responseStatus.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{responseStatus.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSendTestPacket}
              disabled={isSubmitting}
              className="w-full py-2 px-3 bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 border border-[#38BDF8] text-[#38BDF8] font-bold rounded text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'INGESTING...' : 'DISPATCH HARDWARE PACKET'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
