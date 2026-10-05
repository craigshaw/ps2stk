/** PS2-style line wordmark with a readable, live product descriptor. */
export function Brand() {
  return (
    <div className="brand">
      <img className="wordmark" src="/wordmark.svg" alt="PS2STK" width="490" height="58" />
      <span className="brand-caption">PS2 Save Toolkit</span>
    </div>
  );
}
