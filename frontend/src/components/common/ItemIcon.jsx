export function ItemIcon({ url, alt }) {
  if (!url) {
    return (
      <span className="itemIconFallback" title="No icon">
        ◻
      </span>
    );
  }
  return <img className="itemIcon" src={url} alt={alt} loading="lazy" />;
}
