import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  RiDashboard3Line, RiDatabase2Line, RiBluetoothLine,
  RiCompassLine, RiRulerLine, RiFlashlightLine, RiBatteryFill
} from 'react-icons/ri';
import { deviceApi } from '../services/api';
import StatusCard from './StatusCard';
import BatteryBar from './BatteryBar';
import LocationCard from './LocationCard';

const MAX_HISTORY = 60;

export default function Dashboard({
  deviceData,
  lastUpdatedEvent,
  lastDeletedEvent,
  lastAllDeletedEvent,
  deviceInfo,
  isConnected,
  isPhysicalConnected,
  onDisconnect,
  onReconnect,
  pairTime,
  location,
  locationError,
  locationLoading,
}) {
  const [history, setHistory] = useState([]);
  const [flashKey, setFlashKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevDataRef = useRef(null);
  const prevUpdatedRef = useRef(null);
  const prevDeletedRef = useRef(null);
  const prevAllDeletedRef = useRef(null);

  useEffect(() => {
    const fetchLatest = () => {
      deviceApi.getData()
        .then((res) => {
          if (res?.latest) {
            setLastUpdated(res.latest.timestamp || new Date());
            setHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.timestamp === res.latest.timestamp) return prev;
              const updated = [...prev, res.latest];
              return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
            });
          }
        })
        .catch(() => { });
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!deviceData) return;
    if (
      prevDataRef.current &&
      prevDataRef.current._receivedAt === deviceData._receivedAt
    ) return;

    prevDataRef.current = deviceData;
    setFlashKey(k => k + 1);
    setLastUpdated(deviceData.timestamp || new Date());

    setHistory(prev => {
      const updated = [...prev, deviceData];
      return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
    });
  }, [deviceData]);

  useEffect(() => {
    if (!lastUpdatedEvent) return;
    if (
      prevUpdatedRef.current &&
      prevUpdatedRef.current._receivedAt === lastUpdatedEvent._receivedAt
    ) return;

    prevUpdatedRef.current = lastUpdatedEvent;
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());

    setHistory(prev => {
      return prev.map(item => {
        const itemId = item._id || item.id;
        const updatedId = lastUpdatedEvent._id || lastUpdatedEvent.id;
        if (itemId && updatedId && itemId === updatedId) {
          return lastUpdatedEvent;
        }
        return item;
      });
    });
  }, [lastUpdatedEvent]);

  useEffect(() => {
    if (!lastDeletedEvent) return;
    if (
      prevDeletedRef.current &&
      prevDeletedRef.current._receivedAt === lastDeletedEvent._receivedAt
    ) return;

    prevDeletedRef.current = lastDeletedEvent;
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());

    setHistory(prev => {
      return prev.filter(item => {
        const itemId = item._id || item.id;
        const deletedId = lastDeletedEvent.id || lastDeletedEvent._id;
        
        if (itemId && deletedId && itemId === deletedId) {
          return false;
        }
        
        if (lastDeletedEvent.deviceId && item.deviceId === lastDeletedEvent.deviceId) {
          return false;
        }
        
        return true;
      });
    });
  }, [lastDeletedEvent]);

  useEffect(() => {
    if (!lastAllDeletedEvent) return;
    if (
      prevAllDeletedRef.current &&
      prevAllDeletedRef.current === lastAllDeletedEvent
    ) return;

    prevAllDeletedRef.current = lastAllDeletedEvent;
    setHistory([]);
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());
  }, [lastAllDeletedEvent]);

  const current = deviceData || history[history.length - 1] || null;

  const formatTime = (ts) => {
    if (!ts) return '--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(ts));
  };

  const stats = useMemo(() => {
    if (!history.length) return null;
    const tilts = history.map(h => h.tiltAngle).filter((v) => v !== undefined && v !== null);
    const heights = history.map(h => h.height).filter((v) => v !== undefined && v !== null);
    const batts = history.map(h => h.batterySOC).filter((v) => v !== undefined && v !== null);
    const activeVoltage = history.filter(h => h.voltageStatus).length;
    return {
      avgTilt: tilts.reduce((a, b) => a + b, 0) / tilts.length || 0,
      maxTilt: Math.max(...tilts, 0),
      avgHeight: heights.reduce((a, b) => a + b, 0) / heights.length || 0,
      minBattery: Math.min(...batts, 100),
      voltageUptime: history.length ? (activeVoltage / history.length * 100).toFixed(0) : 0,
    };
  }, [history]);

  return (
    <main className="dash-wrapper">
      <div className="dash-topBar">
        <div className="dash-topLeft">
          <RiDashboard3Line className="dash-topIcon" />
          <div>
            <h2 className="dash-pageTitle font-display">Live Dashboard</h2>
            <p className="text-xs text-muted">
              Last update: <span className="font-mono text-cyan">{formatTime(lastUpdated)}</span>
            </p>
          </div>
        </div>
        <div className="dash-topRight">
          <button
            id="btn-cloud-data"
            className="btn btn-ghost btn-sm"
            style={{
              border: '1px solid rgba(0, 229, 255, 0.3)',
              color: 'var(--neon-cyan)',
              background: 'rgba(0, 229, 255, 0.05)',
            }}
            onClick={() => window.open(window.location.origin + '?view=clouddata', '_blank')}
            title="Open database history in another tab"
          >
            <RiDatabase2Line />
            Cloud Data
          </button>

          <button
            id="btn-disconnect"
            className="btn btn-danger btn-sm"
            onClick={onDisconnect}
            title="Disconnect Bluetooth device"
          >
            <RiBluetoothLine />
            Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-4 dash-kpiGrid">
        <StatusCard
          key={`tilt-${flashKey}`}
          icon={<RiCompassLine />}
          label="Tilt Angle"
          value={current?.tiltAngle?.toFixed(1) ?? '--'}
          unit="°"
          color="cyan"
          subLabel={stats ? `Max: ${stats.maxTilt.toFixed(1)}°` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-1"
        />

        <StatusCard
          key={`height-${flashKey}`}
          icon={<RiRulerLine />}
          label="Height"
          value={current?.height?.toFixed(2) ?? '--'}
          unit=" m"
          color="purple"
          subLabel={stats ? `Avg: ${stats.avgHeight.toFixed(2)} m` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-2"
        />

        <StatusCard
          icon={<RiFlashlightLine />}
          label="Voltage Status"
          color={current?.voltageStatus ? 'green' : 'red'}
          subLabel={undefined}
          className="animate-fadeInUp stagger-3"
        >
          <div className={`badge ${current?.voltageStatus ? 'badge-active' : 'badge-inactive'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', marginTop: '0.25rem' }}>
            <div className={`status-dot ${current?.voltageStatus ? 'connected' : 'disconnected'}`} />
            {current?.voltageStatus ? 'Active' : 'Inactive'}
          </div>
        </StatusCard>

        <StatusCard
          key={`batt-${flashKey}`}
          icon={<RiBatteryFill />}
          label="Battery SOC"
          value={current?.batterySOC?.toFixed(1) ?? '--'}
          unit="%"
          color={
            (current?.batterySOC ?? 100) >= 60 ? 'green' :
              (current?.batterySOC ?? 100) >= 30 ? 'yellow' : 'red'
          }
          subLabel={stats ? `Min: ${stats.minBattery.toFixed(1)}%` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-4"
        >
          <BatteryBar value={current?.batterySOC ?? 0} />
        </StatusCard>

        <LocationCard
          location={location}
          error={locationError}
          loading={locationLoading}
          pairTime={pairTime}
          onClick={() => {
            if (location) {
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
                '_blank',
                'noopener,noreferrer'
              );
            }
          }}
        />
      </div>
    </main>
  );
}
