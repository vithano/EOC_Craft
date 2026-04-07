export interface UniqueModsAuditAllowlistEntry {
  /** Case-insensitive regex tested against the resolved line text. */
  re: RegExp
  /** Why this line is intentionally not implemented mechanically. */
  reason: string
}

/**
 * Lines that are currently intentionally NOT modeled in planner stats or battle sim.
 *
 * Keep this list small and high-signal: anything that should affect combat numbers
 * should be implemented instead of allowlisted.
 */
export const UNIQUE_MODS_AUDIT_ALLOWLIST: UniqueModsAuditAllowlistEntry[] = [
  // Enhancement / UI info lines (these are handled elsewhere, not as stat modifiers)
  { re: /^can be enhanced up to enhancement tier \d+$/i, reason: "Enhancement cap info line" },
  { re: /increased effect of other explicit modifiers on this item per enhancement tier$/i, reason: "Explicit scaling info line (applied during unique text resolution)" },

  // Encounter / pacing / action bar mechanics (not modeled)
  { re: /action bar/i, reason: "Action bar mechanics not modeled" },
  { re: /skip non-elite enemy encounters/i, reason: "Encounter selection mechanics not modeled" },
  { re: /beginning of combat/i, reason: "Encounter timing mechanics not modeled" },
  { re: /^once per stage,/i, reason: "Stage-based death prevention mechanics not modeled" },
  { re: /^every \d+ seconds?,/i, reason: "Timed triggers not modeled" },
  { re: /^after you cast a spell,/i, reason: "Trigger not modeled" },
  { re: /^when you cast a spell,/i, reason: "Trigger not modeled" },
  { re: /^when you attack/i, reason: "Trigger not modeled" },
  { re: /^when you block/i, reason: "Trigger not modeled" },

  // Enemy execution / special win conditions (not modeled)
  { re: /\bare executed\b/i, reason: "Execute mechanics not modeled" },
  { re: /lose \d+% of maximum life at the beginning of combat/i, reason: "Enemy pre-combat life loss not modeled" },

  // Ailment reflection / propagation (not modeled)
  { re: /are reflected to you/i, reason: "Ailment reflection not modeled" },
  { re: /carry on to subsequent enemies/i, reason: "Ailment propagation not modeled" },
  { re: /have infinite duration/i, reason: "Infinite ailment duration not modeled" },

  // Special conversion / attribute conversion rules not modeled
  { re: /is converted to strength$/i, reason: "Attribute conversion not modeled" },
  { re: /your total evasion rating is converted into armour/i, reason: "Stat conversion not modeled" },

  // Meta-progression lines
  { re: /increased experience gain$/i, reason: "Experience gain not modeled" },

  // Not-yet-modeled combat mechanics / scaling rules
  { re: /increased attribute requirements$/i, reason: "Attribute requirement scaling not modeled" },
  { re: /chance to avoid (?:elemental )?ailments$/i, reason: "Ailment avoidance not modeled" },
  // (modeled) max shock/chill caps now affect battle sim
  { re: /more speed per/i, reason: "Conditional self-state speed scaling not modeled" },
  { re: /more attack and cast speed per/i, reason: "Conditional resource-based speed scaling not modeled" },
  { re: /more accuracy rating per/i, reason: "Conditional attack-time scaling not modeled" },
  { re: /increased effect of modifiers gained from class passives/i, reason: "Class-passive modifier mirroring not modeled" },
  { re: /increased melee critical hit chance per 10 intelligence/i, reason: "Attribute-scaled crit for melee only not modeled" },
  { re: /increased range attack damage per 10 strength/i, reason: "Attribute-scaled ranged damage not modeled" },
  // (modeled) increased shock effect now affects battle sim
  { re: /increased recovery from all sources/i, reason: "Global recovery scaling not modeled" },
  { re: /chance to reduce no damage on block/i, reason: "Block variance not modeled" },
  // (modeled) mana regen can be diverted to ES
  { re: /abilities gain additional base mana cost/i, reason: "Ability cost scaling by max energy not modeled" },
  { re: /ailments inflicted with critical hits gain/i, reason: "Ailment duration scaling by crit stats not modeled" },
  { re: /all elemental damage types can (?:chill|ignite|shock)/i, reason: "Cross-element ailment eligibility not modeled" },
  { re: /cannot evade while you are above/i, reason: "Conditional evasion disable not modeled" },
  { re: /cannot recover life while above/i, reason: "Conditional recovery disable not modeled" },
  { re: /chaos damage can inflict all elemental ailments/i, reason: "Chaos ailment eligibility not modeled" },
  { re: /counts as dual-wielding/i, reason: "Dual-wield tag mechanics not modeled" },
  { re: /critical hits have a 100% chance to inflict poison/i, reason: "Crit-conditional ailment overrides not modeled" },
  { re: /critical hits have a 100% chance to inflict elemental ailments/i, reason: "Crit-conditional ailment overrides not modeled" },
  // (modeled) enemy resistance mirroring + chill immunity + enemy less dmg / more speed now affect battle sim
  { re: /excess recovery from life leech is applied to your energy shield instead/i, reason: "Leech overflow to ES not modeled" },
  { re: /gain armour equal to \d+% of maximum mana/i, reason: "Cross-stat conversion (mana→armour) not modeled" },
  { re: /^if your death was prevented/i, reason: "Stage-based death prevention mechanics not modeled" },
  { re: /ignite effects.*randomly gain between/i, reason: "Randomized ailment duration not modeled" },
  { re: /^increased local attack speed/i, reason: "Non-standard local attack speed format not modeled" },
  { re: /leech .* from spells as energy shield/i, reason: "Spell leech to ES not modeled" },
  { re: /life leech effects apply to your energy shield instead/i, reason: "Leech to ES replacement not modeled" },
  { re: /lose \d+ life per second/i, reason: "Self-damage over time from gear not modeled" },
  // (modeled) ability costs can be paid with ES
  { re: /poison you inflict is reflected to you/i, reason: "Ailment reflection not modeled" },
  { re: /recover \d+% of mana on kill/i, reason: "Mana on kill % not modeled" },
  { re: /regenerate \d+ life per second per character level/i, reason: "Level-scaled regen not modeled" },
  { re: /regenerate \d+% of maximum life per second while you are ignited/i, reason: "Conditional regen not modeled" },
  // (modeled) current-mana sacrifice per second
  { re: /take \d+% less poison damage/i, reason: "Poison taken multiplier not modeled" },
  { re: /take chaos damage equal to/i, reason: "Self-damage on cast not modeled" },
  { re: /take physical damage equal to/i, reason: "Self-damage on attack not modeled" },
  { re: /aggregated effect of shock/i, reason: "Shock stacking rules not modeled" },
  { re: /effect of shock you inflict is always/i, reason: "Fixed shock magnitude not modeled" },
  { re: /local damage of your weapons applies to spells/i, reason: "Weapon local damage applying to spells not modeled" },
  { re: /perform an additional hit/i, reason: "Extra-hit proc not modeled" },
  { re: /chance to dodge is rolled twice/i, reason: "RNG advantage/disadvantage not modeled" },
  { re: /when you would block, dodge instead/i, reason: "Block→dodge replacement not modeled" },
  { re: /when you would deal double damage,.*triple/i, reason: "Damage proc chaining not modeled" },
  { re: /when you would deal triple damage,.*quadruple/i, reason: "Damage proc chaining not modeled" },
  { re: /^while you have at least 400/i, reason: "Attribute-threshold conditional lines not modeled (except Titansblood subset)" },
  { re: /^while your energy shield is below/i, reason: "Conditional self-sacrifice to restore ES not modeled" },
  { re: /^while your off-hand is empty, your first attack/i, reason: "Encounter-first-hit mechanics not modeled" },
  { re: /you are unaffected by chill/i, reason: "Ailment immunity not modeled" },
  { re: /you cannot evade(?: or dodge)?$/i, reason: "Evasion/dodge disable not modeled" },
  { re: /you cannot evade while you have energy shield/i, reason: "Conditional evasion disable not modeled" },
  // (modeled) no-mana build state
  { re: /your armour has no effect against physical damage taken/i, reason: "Armour disable rules not modeled" },
  { re: /chance to block is (?:doubled|halved)/i, reason: "Block chance overrides not modeled" },
  { re: /your chaos damage can ignite/i, reason: "Chaos ignite eligibility not modeled" },
  { re: /your critical hit chance is \d+%/i, reason: "Fixed crit chance override not modeled" },
  { re: /energy shield cannot be reduced below its maximum/i, reason: "Special ES floor not modeled" },
  { re: /hits inflict chill as though dealing/i, reason: "Chill magnitude override not modeled" },
  { re: /leech effects also apply to damage over time/i, reason: "Leech interaction with DoT not modeled" },
  { re: /lightning damage can inflict poison/i, reason: "Cross-element ailment eligibility not modeled" },
  { re: /critical damage multiplier per 20 accuracy rating/i, reason: "Accuracy-scaled crit multiplier not modeled" },
  { re: /life per magic item equipped/i, reason: "Per-equipped-item scaling not modeled" },
  { re: /armou?r per 10 intelligence/i, reason: "Attribute-scaled armour not modeled" },
  { re: /^\d+\s+increased\s+defences$/i, reason: "Non-standard defences text format not modeled" },
  { re: /less ailment duration$/i, reason: "Ailment duration less multiplier not modeled" },
  { re: /more shock duration$/i, reason: "Shock duration scaling not modeled" },
  { re: /less ignite duration$/i, reason: "Ignite duration less multiplier not modeled" },
  { re: /^critital hits have a 100% chance to inflict elemental ailments$/i, reason: "Data typo; crit-conditional ailment override not modeled" },
]

