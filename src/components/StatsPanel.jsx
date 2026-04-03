import './StatsPanel.css';

export default function StatsPanel({ stats }) {
  return (
    <div className="card">
      <div className="card-title"><span className="icon">📊</span> Computed Stats</div>
      <div className="stats-grid">
        <div className="stat-block highlight">
          <span className="stat-block-label">Damage</span>
          <span className="stat-block-value damage">{stats.damage}</span>
          <span className="stat-block-sub">base dmg</span>
        </div>
        <div className="stat-block highlight">
          <span className="stat-block-label">Eff. Damage</span>
          <span className="stat-block-value eff-dmg">{stats.effectiveDamage}</span>
          <span className="stat-block-sub">with crits</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Armor</span>
          <span className="stat-block-value armor">{stats.armor}</span>
          <span className="stat-block-sub">{stats.damageReduction}% dmg red.</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Evasion</span>
          <span className="stat-block-value evasion">{stats.evasion}</span>
          <span className="stat-block-sub">dodge rating</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Health</span>
          <span className="stat-block-value health">{stats.health}</span>
          <span className="stat-block-sub">hp pool</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Mana</span>
          <span className="stat-block-value mana">{stats.mana}</span>
          <span className="stat-block-sub">mana pool</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Crit Chance</span>
          <span className="stat-block-value crit">{stats.critChance}%</span>
          <span className="stat-block-sub">critical rate</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-label">Dmg Reduction</span>
          <span className="stat-block-value dmg-red">{stats.damageReduction}%</span>
          <span className="stat-block-sub">from armor</span>
        </div>
      </div>
      <div className="attrs-section">
        <div className="attrs-title">Attributes</div>
        <div className="attrs-grid">
          {['strength', 'agility', 'intelligence', 'vitality', 'dexterity'].map((attr) => (
            <div key={attr} className="attr-block">
              <div className="attr-name">{attr.slice(0, 3).toUpperCase()}</div>
              <div className="attr-value">{stats[attr]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
