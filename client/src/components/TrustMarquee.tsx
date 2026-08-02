export function TrustMarquee() {
  const items = [
    "Bygget til det danske ejendomsmarked",
    "GDPR-compliant — dine data forbliver i EU",
    "Ingen binding — afmeld hvornår du vil",
    "Professionel kvalitet på 30 sekunder",
    "Fra tom bolig til salgsklar — øjeblikkeligt",
    "AI visualiseringer · 3D plantegninger · Showcase videoer",
    "Ingen skjulte gebyrer — transparent prissætning",
    "Dokumenteret besparelse per bolig",
  ];

  // Duplicate items for seamless infinite loop
  const looped = [...items, ...items];

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
