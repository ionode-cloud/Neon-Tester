import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ionode.neontester',
  appName: 'Neon Tester',
  webDir: 'dist',
  server: {
    // For production, the app loads from the bundled dist/ folder.
    // During development, uncomment the line below and set your PC's IP
    // so the app live-reloads from Vite dev server:
    // url: 'http://192.168.1.XXX:3000',
    androidScheme: 'https',
  },
  plugins: {
    BluetoothLe: {
      // Display name shown in the Bluetooth permission dialog
      displayStrings: {
        scanning: 'Scanning for BLE devices…',
        cancel: 'Cancel',
        availableDevices: 'Available Devices',
        noDeviceFound: 'No device found',
      },
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
