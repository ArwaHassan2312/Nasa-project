// HTTPS pages may contact an HTTP server on the LAN only through browsers that
// support Local Network Access and after the player grants that permission.
export function fetchLocalNetwork(url, options = {}) {
  const hostname = new URL(url, window.location.href).hostname.toLowerCase();
  const addressSpace = hostname === 'localhost'
    || hostname === '::1'
    || hostname.startsWith('127.')
    ? 'loopback'
    : 'local';
  return fetch(url, { ...options, targetAddressSpace: addressSpace });
}
