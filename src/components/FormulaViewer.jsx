import { FORMULA_DESCRIPTIONS } from '../data/formulas';
import './FormulaViewer.css';

export default function FormulaViewer() {
  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">🧮</span> Formula Engine
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--accent-yellow)', fontWeight: 700, letterSpacing: '0.1em' }}>PLACEHOLDER</span>
      </div>
      <div className="formula-viewer">
        <p className="formula-intro">
          The following formulas are <span>placeholders</span> used to compute derived stats.
          In a future version, you will be able to plug in custom formula functions directly
          via the formula editor or an external config file.
        </p>
        <div className="formula-grid">
          {Object.entries(FORMULA_DESCRIPTIONS).map(([name, formula]) => (
            <div key={name} className="formula-block">
              <div className="formula-name">{name}</div>
              <div className="formula-code">{formula}</div>
            </div>
          ))}
        </div>
        <div className="plugin-section">
          <span className="plugin-icon">🔌</span>
          <div className="plugin-text">
            <h3>Custom Formula Plug-in (Coming Soon)</h3>
            <p>
              Replace any formula by exporting a <code>computeStats</code> function from{' '}
              <code>src/data/formulas.js</code>. The function receives{' '}
              <code>(classId, equipModifiers, upgradeModifiers, classBaseStats)</code>{' '}
              and must return an object with all stat keys. All placeholder comments are marked
              with <code>// PLACEHOLDER FORMULA:</code> in the source.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
