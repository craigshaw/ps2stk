/** Relay identity: two memory cards linked by a transfer path. */
export function BrandSymbol() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M10 12h17v40H10zM37 12h17v40H37z" stroke="#8EAFFF" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M16 45h5M43 19h5" stroke="#8EAFFF" strokeWidth="3.5" strokeLinecap="square" />
      <path d="m21 39 22-17" stroke="#E9EFFF" strokeWidth="5" strokeLinecap="square" />
      <path d="m36 20 9 1-2 9" stroke="#E9EFFF" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
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
