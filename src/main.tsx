import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return <main>
    <p className="eyebrow">PS2STK</p>
    <h1>Your saves. Your cards.</h1>
    <p>A local memory card workspace for PlayStation 2.</p>
    <section aria-labelledby="status">
      <h2 id="status">Card engine in development</h2>
      <p>The first milestone verifies binary reading and copying through a test harness.
        The two-card explorer and animated save previews come next.</p>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
