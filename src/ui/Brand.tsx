/** Original PS2STK identity: two open orbits sharing a transfer path. */
export function BrandSymbol() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M34 9H23A15 15 0 0 0 8 24v1M14 39h11a15 15 0 0 0 15-15v-1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="m13 30 9-12h13M35 18l-9 12H13" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="8" cy="31" r="2" fill="currentColor" />
      <circle cx="40" cy="17" r="2" fill="currentColor" />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="brand" aria-label="PS2STK, PS2 Save Toolkit">
      <span className="brand-mark"><BrandSymbol /></span>
      <div className="brand-type">
        <svg className="wordmark" viewBox="0 0 187 30" role="img" aria-label="PS2STK" fill="none">
          <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="round">
            <path d="M3 27V3h16l4 4v7l-4 4H3M53 3H36l-4 4v5l4 3h13l4 3v5l-4 4H32M63 3h15l5 5v4L63 27h20" />
            <path d="M116 3H99l-4 4v5l4 3h13l4 3v5l-4 4H95M126 3h23m-11.5 0v24M160 3v24m23-24-16 12 16 12m-23-12h7" />
          </g>
        </svg>
        <span className="brand-caption">PS2 Save Toolkit</span>
      </div>
    </div>
  );
}
