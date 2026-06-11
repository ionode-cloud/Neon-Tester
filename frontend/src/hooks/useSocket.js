import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

/**
 * useSocket — Custom hook for Socket.IO real-time data.
 *
 * Returns:
 *   - deviceData       : latest data point from backend
 *   - connectionStatus : server-side connection state
 *   - connectionLog    : array of log entries
 *   - isSocketConnected: boolean
 *   - emitBluetoothData(data): push BLE data to backend
 *   - emitDeviceConnected(info)
 *   - emitDeviceDisconnected(info)
 */
export default function useSocket() {
  const socketRef = useRef(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [deviceData, setDeviceData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connectionLog, setConnectionLog] = useState([]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsSocketConnected(true);
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
      console.log('[Socket] Disconnected');
    });

    socket.on('deviceData', (data) => {
      setDeviceData({ ...data, _receivedAt: Date.now() });
    });

    socket.on('connectionStatus', (status) => {
      setConnectionStatus(status);
    });

    socket.on('connectionLog', (log) => {
      setConnectionLog(log);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emitBluetoothData = useCallback((data) => {
    socketRef.current?.emit('bluetoothData', data);
  }, []);

  const emitDeviceConnected = useCallback((info) => {
    socketRef.current?.emit('deviceConnected', info);
  }, []);

  const emitDeviceDisconnected = useCallback((info) => {
    socketRef.current?.emit('deviceDisconnected', info);
  }, []);

  return {
    deviceData,
    connectionStatus,
    connectionLog,
    isSocketConnected,
    emitBluetoothData,
    emitDeviceConnected,
    emitDeviceDisconnected,
  };
}
