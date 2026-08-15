export function Icon({
  name,
  className,
}: {
  name:
    | "search"
    | "eye-off"
    | "isolate"
    | "eye"
    | "zoom"
    | "section"
    | "center"
    | "camera"
    | "box"
    | "home"
    | "folder"
    | "save";
  className?: string;
}) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.2-3.2" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...common}>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7-0.4 1.1-1.2 2.3-2.2 3.3" />
          <path d="M6.1 6.1C4.4 7.4 3.1 9.1 2 12c1 3 5 7 10 7 1.4 0 2.7-.3 3.9-.8" />
        </svg>
      );
    case "isolate":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "zoom":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="14" height="12" rx="2" />
          <path d="M8 10h6M11 7v6" />
        </svg>
      );
    case "section":
      return (
        <svg {...common}>
          <path d="M4 20L20 4" />
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      );
    case "center":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 7h6l2 2h10v10H3z" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v5h8V4" />
          <path d="M8 20v-6h8v6" />
        </svg>
      );
  }
}
