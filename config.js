// Public configuration only. Never put passwords, tokens or database files here.
// Host PC's full Tailscale device address. Start the backend and Funnel for access.
// A local preview on the host PC (Start Preview.cmd) talks to the server on this PC directly.
window.COMMAND_MATRIX_CONFIG = {backendUrl: ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://127.0.0.1:8765' : 'https://ben-pc.tail849486.ts.net'};
