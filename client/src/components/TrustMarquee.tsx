import { useTranslation } from "react-i18next";

export function TrustMarquee() {
  const { t } = useTranslation();
  const items = t("trustMarquee", { returnObjects: true }) as string[];

  // Two sets per half keep even the short, three-item translation wider than
  // the viewport. The second half is identical for a seamless CSS loop.
  const sequence = [...items, ...items];
  const looped = [...sequence, ...sequence];

  return (
    <div
      style={{
        background: "#0F1D2F",
        overflow: "hidden",
        padding: "13px 0",
        borderTop: "1px solid rgba(200,149,108,0.15)",
        borderBottom: "1px solid rgba(200,149,108,0.15)",
      }}
      aria-hidden="true"
    >
      <div
        className="forma-marquee-track"
        style={{ display: "flex", width: "max-content" }}
      >
        {looped.map((item, i) => (
          <span
            key={i}
            style={{
              color: "rgba(245,243,239,0.75)",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              padding: "0 28px",
              display: "inline-flex",
              alignItems: "center",
              gap: "28px",
            }}
          >
            {item}
            <span style={{ color: "#C8956C", opacity: 0.5, fontSize: "8px" }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
