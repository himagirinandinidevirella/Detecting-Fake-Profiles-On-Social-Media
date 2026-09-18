interface Props {
  title?: string;
  message?: string;
  glyph?: string;
  compact?: boolean;
}

/** Shown instead of a chart whenever a query returns no rows. */
export default function EmptyState({ title = 'No data available', message, glyph = '📭', compact }: Props) {
  return (
    <div className="empty-state" style={compact ? { minHeight: 130, padding: '22px 14px' } : undefined}>
      <div className="glyph" aria-hidden>{glyph}</div>
      <b>{title}</b>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
