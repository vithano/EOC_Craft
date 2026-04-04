import type { CSSProperties } from "react";
import type { StaticImageData } from "next/image";
import { isUniqueItemId } from "../data/eocUniques";
import armorSvg from "../assets/armor.svg";
import beltSvg from "../assets/belt.svg";
import bootsSvg from "../assets/boots.svg";
import handsSvg from "../assets/hands.svg";
import helmetSvg from "../assets/helmet.svg";
import necklaceSvg from "../assets/necklace.svg";
import ring1Svg from "../assets/ring1.svg";
import ring2Svg from "../assets/ring2.svg";
import shieldSvg from "../assets/shield.svg";
import weaponSvg from "../assets/weapon.svg";

export type EquipmentGlyphKey =
  | "helmet"
  | "chest"
  | "gloves"
  | "boots"
  | "belt"
  | "amulet"
  | "ring1"
  | "ring2"
  | "weapon"
  | "shield";

/** Next bundles SVG imports as `StaticImageData` with `.src` (string URL). */
function svgUrl(imp: string | StaticImageData): string {
  return typeof imp === "string" ? imp : imp.src;
}

const GLYPH_SRC: Record<EquipmentGlyphKey, string> = {
  helmet: svgUrl(helmetSvg),
  chest: svgUrl(armorSvg),
  gloves: svgUrl(handsSvg),
  boots: svgUrl(bootsSvg),
  belt: svgUrl(beltSvg),
  amulet: svgUrl(necklaceSvg),
  ring1: svgUrl(ring1Svg),
  ring2: svgUrl(ring2Svg),
  weapon: svgUrl(weaponSvg),
  shield: svgUrl(shieldSvg),
};

function maskStyle(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

function EquipmentAssetMask({ src, className }: { src: string; className: string }) {
  return (
    <span
      className={`inline-block shrink-0 bg-current ${className}`}
      style={maskStyle(src)}
      aria-hidden
    />
  );
}

/** Paper-doll empty slot (faded). */
export function EmptySlotIcon({ type }: { type: string }) {
  const key = (type in GLYPH_SRC ? type : "chest") as EquipmentGlyphKey;
  const src = GLYPH_SRC[key] ?? GLYPH_SRC.chest;
  return (
    <span className="inline-flex text-[#c4b5a0]">
      <EquipmentAssetMask src={src} className="h-6 w-6 opacity-[0.22]" />
    </span>
  );
}

export function plannerSlotToGlyphKey(slot: string): EquipmentGlyphKey {
  switch (slot) {
    case "Helmet":
      return "helmet";
    case "Chest":
      return "chest";
    case "Gloves":
      return "gloves";
    case "Boots":
      return "boots";
    case "Belt":
      return "belt";
    case "Amulet":
      return "amulet";
    case "Ring 1":
      return "ring1";
    case "Ring 2":
      return "ring2";
    case "Weapon":
      return "weapon";
    case "Off-hand":
      return "shield";
    default:
      return "chest";
  }
}

function equippedGlyphKey(slot: string): EquipmentGlyphKey {
  return plannerSlotToGlyphKey(slot);
}

function itemHueClass(slot: string, itemId: string): string {
  if (isUniqueItemId(itemId)) return "text-[#d4af37]";
  if (slot === "Weapon") return "text-[#c0c0d8]";
  if (slot === "Off-hand") return "text-[#a89070]";
  if (slot.includes("Ring") || slot === "Amulet") return "text-[#9cf]";
  return "text-[#6b8f71]";
}

function itemIconSizeClass(slot: string): string {
  return slot === "Weapon" || slot === "Off-hand" ? "h-8 w-8" : "h-7 w-7";
}

/** Inventory / equipped cell icon (colored by rarity slot). */
export function EquippedItemIcon({ slot, itemId }: { slot: string; itemId: string }) {
  if (itemId === "none") return null;
  const key = equippedGlyphKey(slot);
  const src = GLYPH_SRC[key];
  return (
    <span className={`inline-flex ${itemHueClass(slot, itemId)}`}>
      <EquipmentAssetMask src={src} className={itemIconSizeClass(slot)} />
    </span>
  );
}

/** Compact icons for filter toggles (16px). */
export function FilterIcon({ kind }: { kind: "all" | "weapons" | "armor" | "accessories" }) {
  const key: EquipmentGlyphKey =
    kind === "all"
      ? "chest"
      : kind === "weapons"
        ? "weapon"
        : kind === "armor"
          ? "helmet"
          : "amulet";
  return <EquipmentAssetMask src={GLYPH_SRC[key]} className="h-4 w-4" />;
}
