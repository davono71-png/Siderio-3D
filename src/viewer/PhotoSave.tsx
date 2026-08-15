import { useState } from "react";
import { Icon } from "../ui/icons";

export function PhotoSave({
  className,
  saving,
  onSave,
}: {
  className?: string;
  saving: boolean;
  onSave: (name: string) => Promise<boolean> | boolean;
}) {
  const [name, setName] = useState("");
  const submit = async () => {
    const ok = await onSave(name);
    if (ok) setName("");
  };
  return (
    <label className={`save-config ${className ?? ""}`}>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nome foto"
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      <button type="button" className="primary" disabled={saving} onClick={() => void submit()}>
        <Icon name="camera" />
        Scatta foto
      </button>
    </label>
  );
}
