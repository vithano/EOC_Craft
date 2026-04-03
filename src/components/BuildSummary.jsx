import { useState } from 'react';
import './BuildSummary.css';

function RatingBar({ label, value, max, fillClass }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="rating-bar">
      <div className="rating-label">{label}</div>
      <div className="rating-track">
        <div className={`rating-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BuildSummary({ selectedClass, equipped, activeUpgrades, stats }) {
  const [buildName, setBuildName] = useState('My Build');
  const equippedCount = Object.values(equipped).filter((v) => v && v !== 'none').length;
  const upgradeCount = activeUpgrades.length;

  const damageRating = Math.min(100, (stats.effectiveDamage / 300) * 100);
  const defenseRating = Math.min(100, (stats.armor / 200) * 100 * 0.5 + (stats.evasion / 100) * 100 * 0.5);
  const utilityRating = Math.min(100, ((stats.health / 1000) * 100 * 0.5 + (stats.mana / 600) * 100 * 0.5));

  return (
    <div className="card">
      <div className="card-title"><span className="icon">📋</span> Build Summary</div>
      <input
        className="build-name-input"
        value={buildName}
        onChange={(e) => setBuildName(e.target.value)}
        placeholder="Build name..."
      />
      <div className="build-summary-rows">
        <div className="summary-row">
          <span className="summary-label">Class</span>
          <span className="summary-value" style={{ textTransform: 'capitalize' }}>{selectedClass}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Items Equipped</span>
          <span className={`summary-value${equippedCount >= 7 ? ' great' : equippedCount >= 4 ? ' good' : ''}`}>{equippedCount} / 9</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Upgrades Active</span>
          <span className={`summary-value${upgradeCount >= 4 ? ' great' : upgradeCount >= 2 ? ' good' : ''}`}>{upgradeCount} / 5</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Eff. Damage</span>
          <span className="summary-value danger">{stats.effectiveDamage}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Survivability</span>
          <span className="summary-value good">{stats.health} HP / {stats.damageReduction}% DR</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Crit Rate</span>
          <span className="summary-value">{stats.critChance}%</span>
        </div>
      </div>
      <RatingBar label="Damage Rating" value={damageRating} max={100} fillClass="damage-fill" />
      <RatingBar label="Defense Rating" value={defenseRating} max={100} fillClass="defense-fill" />
      <RatingBar label="Utility Rating" value={utilityRating} max={100} fillClass="utility-fill" />
    </div>
  );
}
