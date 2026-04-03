import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS } from '../data/equipment';
import './EquipmentPanel.css';

export default function EquipmentPanel({ equipped, onEquip }) {
  return (
    <div className="card">
      <div className="card-title"><span className="icon">🎒</span> Equipment</div>
      <div className="equipment-slots">
        {EQUIPMENT_SLOTS.map((slot) => {
          const items = EQUIPMENT_ITEMS[slot] || [];
          const selectedId = equipped[slot] || 'none';
          const selectedItem = items.find((i) => i.id === selectedId) || items[0];
          const mods = selectedItem?.modifiers || {};
          const hasMods = Object.keys(mods).length > 0;

          return (
            <div key={slot}>
              <div className="equipment-slot">
                <span className="slot-label">{slot}</span>
                <select
                  className="slot-select"
                  value={selectedId}
                  onChange={(e) => onEquip(slot, e.target.value)}
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              {hasMods && (
                <div className="equipment-slot">
                  <span />
                  <div className="item-modifiers">
                    {Object.entries(mods).map(([k, v]) => (
                      <span key={k} className="mod-tag">+{v} {k}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
