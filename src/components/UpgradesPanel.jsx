import { UPGRADES } from '../data/upgrades';
import './UpgradesPanel.css';

export default function UpgradesPanel({ selectedClass, activeUpgrades, onToggleUpgrade }) {
  const upgrades = UPGRADES[selectedClass] || [];

  return (
    <div className="card">
      <div className="card-title"><span className="icon">⬆️</span> Upgrades &amp; Skills</div>
      {upgrades.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Select a class to see upgrades.</p>
      ) : (
        <div className="upgrades-list">
          {upgrades.map((upg) => {
            const isActive = activeUpgrades.includes(upg.id);
            return (
              <button
                key={upg.id}
                className={`upgrade-item${isActive ? ' active' : ''}`}
                onClick={() => onToggleUpgrade(upg.id)}
              >
                <div className="upgrade-checkbox">{isActive ? '✓' : ''}</div>
                <div className="upgrade-info">
                  <div className="upgrade-name">{upg.name}</div>
                  <div className="upgrade-desc">{upg.description}</div>
                  <div className="upgrade-bonuses">
                    {Object.entries(upg.modifiers).map(([k, v]) => (
                      <span key={k} className="upgrade-bonus-tag">+{v} {k}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
