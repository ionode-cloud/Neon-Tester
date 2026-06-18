import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Disable React DevTools installation warning
if (typeof window !== 'undefined') {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: true,
  };
}

// Global console log filter to silence noisy debugging logs
const ignoredLogPatterns = [
  'Download the React DevTools',
  '[Web] Bluetooth initialized',
  'BluetoothCommunicationWeb',
  '[Classic-BT]',
  '[Socket]',
  '[Web] startScanning',
  '[Web] Requesting Web Serial',
  '[Web Serial]',
  '[App]',
  '[Mock-BT]'
];

const originalLog = console.log;
console.log = function (...args) {
  const message = args.map(arg => {
    try {
      return typeof arg === 'string' ? arg : JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
  if (ignoredLogPatterns.some(pattern => message.includes(pattern))) {
    return;
  }
  originalLog.apply(console, args);
};

const originalWarn = console.warn;
console.warn = function (...args) {
  const message = args.map(arg => {
    try {
      return typeof arg === 'string' ? arg : JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
  if (ignoredLogPatterns.some(pattern => message.includes(pattern))) {
    return;
  }
  originalWarn.apply(console, args);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
