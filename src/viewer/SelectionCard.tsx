import { MATERIALS, formatMm, formatWeight, isMaterialId, type MaterialId } from "../../shared/material";
import type { PartMeasure } from "./engine";

export function SelectionCard({
  measure,
  onMaterial,
}: {
  measure: PartMeasure | null;
  onMaterial?: (materialId: MaterialId) => void;
}) {
  if (!measure || measure.ids.length === 0) return null;
  const materialSelect = onMaterial ? (
    <label className="mat-field">
      <span className="prop-k">Materiale</span>
      <select
        className="mat-select"
        value={measure.materialId ?? ""}
        onChange={(event) => {
          if (isMaterialId(event.target.value)) onMaterial(event.target.value);
        }}
        aria-label="Materiale"
      >
        <option value="">{measure.material === "Vari" ? "Vari" : "Scegli materiale"}</option>
        {MATERIALS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <>
      <div className="prop-k">Materiale</div>
      <div className="prop-v">{measure.material ?? "—"}</div>
    </>
  );
  if (measure.multi) {
    return (
      <div className="part-props">
        {materialSelect}
        <div className="prop-k">Peso totale</div>
        <div className="prop-v">{formatWeight(measure.weightKg)}</div>
      </div>
    );
  }
  return (
    <div className="part-props">
      <div className="prop-k">Nome</div>
      <div className="prop-v">{measure.names[0]}</div>
      {materialSelect}
      <div className="prop-k">Ingombro X / Y / Z</div>
      <div className="prop-v">
        {measure.size
          ? `${formatMm(measure.size.x)} × ${formatMm(measure.size.y)} × ${formatMm(measure.size.z)}`
          : "—"}
      </div>
      <div className="prop-k">Peso</div>
      <div className="prop-v">
        {measure.materialId === "muri"
          ? "— (muri esclusi)"
          : measure.materialId
            ? formatWeight(measure.weightKg)
            : "— (scegli un materiale)"}
      </div>
    </div>
  );
}
