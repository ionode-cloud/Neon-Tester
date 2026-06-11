import React from 'react';

export default function StatusCard({
  icon,
  label,
  value,
  unit = '',
  color = 'cyan',
  subLabel,
  highlight,
  children,
  className = '',
}) {
  return (
    <div
      className={`card card-status card-status-${color} ${highlight ? 'card-status-flash' : ''} ${className}`}
      aria-label={`${label}: ${value}${unit}`}
    >
      <div className={`card-cornerAccent card-accent-${color}`} />

      <div className="card-header">
        <div className={`card-iconBox card-icon-${color}`}>
          {icon}
        </div>
        <div className="card-labelGroup">
          <span className="card-label section-label">{label}</span>
          {subLabel && <span className="card-subLabel">{subLabel}</span>}
        </div>
      </div>

      {value !== undefined && value !== null && (
        <div className="card-valueRow">
          <span className={`card-value font-display card-val-${color}`}>
            {value}
          </span>
          {unit && <span className="card-unit">{unit}</span>}
        </div>
      )}

      {children && <div className="card-extra">{children}</div>}
    </div>
  );
}
