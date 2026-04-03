import { CLASSES } from '../data/classes';
import './ClassSelector.css';

export default function ClassSelector({ selectedClass, onSelectClass }) {
  const cls = CLASSES.find((c) => c.id === selectedClass);

  return (
    <div className="card">
      <div className="card-title"><span className="icon">🧙</span> Class</div>
      <div className="class-grid">
        {CLASSES.map((c) => (
          <button
            key={c.id}
            className={`class-card${selectedClass === c.id ? ' selected' : ''}`}
            onClick={() => onSelectClass(c.id)}
          >
            <span className="class-icon">{c.icon}</span>
            <span className="class-name">{c.name}</span>
          </button>
        ))}
      </div>
      {cls && (
        <>
          <p className="class-desc">{cls.description}</p>
          <div className="base-stats">
            {Object.entries(cls.baseStats).map(([stat, val]) => (
              <div key={stat} className="stat-row">
                <span className="stat-name">{stat}</span>
                <div className="stat-bar-wrap">
                  <div className="stat-bar" style={{ width: `${Math.min(100, (val / 30) * 100)}%` }} />
                </div>
                <span className="stat-val">{val}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
