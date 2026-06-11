import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';


export default function useSocket() {
  const socketRef = useRef(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [deviceData, setDeviceData] = useState(null);
  const [lastCreated, setLastCreated] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [lastAllDeleted, setLastAllDeleted] = useState(null);
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
      const reading = { ...data, _receivedAt: Date.now() };
      setDeviceData(reading);
      setLastCreated(reading);
    });

    socket.on('deviceDataUpdated', (data) => {
      setLastUpdated({ ...data, _receivedAt: Date.now() });
    });

    socket.on('deviceDataDeleted', (data) => {
      setLastDeleted({ ...data, _receivedAt: Date.now() });
    });

    socket.on('deviceDataAllDeleted', () => {
      setLastAllDeleted(Date.now());
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
    lastCreated,
    lastUpdated,
    lastDeleted,
    lastAllDeleted,
    connectionStatus,
    connectionLog,
    isSocketConnected,
    emitBluetoothData,
    emitDeviceConnected,
    emitDeviceDisconnected,
  };
}
