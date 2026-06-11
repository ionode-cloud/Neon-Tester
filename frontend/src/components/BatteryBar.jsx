import React from 'react';
import { RiBatteryFill, RiBatteryLowFill, RiBatteryChargeLine } from 'react-icons/ri';

export default function BatteryBar({ value = 0 }) {
  const clamped = Math.max(0, Math.min(100, value));

  const getColor = () => {
    if (clamped >= 60) return 'green';
    if (clamped >= 30) return 'yellow';
    return 'red';
  };

  const getIcon = () => {
    if (clamped <= 20) return <RiBatteryLowFill />;
    if (clamped >= 80) return <RiBatteryFill />;
    return <RiBatteryChargeLine />;
  };

  const colorClass = getColor();

  return (
    <div className="batt-wrapper">
      <div className={`batt-icon batt-${colorClass}`}>
        {getIcon()}
      </div>

      <div className="batt-track">
        <div
          className={`batt-fill batt-${colorClass}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Battery: ${clamped}%`}
        >
          <div className="batt-shimmer" />
        </div>
      </div>

      <span className={`batt-label batt-${colorClass}`}>
        {clamped.toFixed(1)}%
      </span>
    </div>
  );
}
