let available = true;
export function networkAvailable() {
  return navigator.onLine && available;
}
export function setNetworkAvailable(value) {
  available = value;
  window.dispatchEvent(new CustomEvent('kc-connectivity', { detail: value }));
}
