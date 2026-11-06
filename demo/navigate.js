// Page navigation for the demo tools in one place, so the DOM tests can follow it.
export function navigate(url, { replace = false } = {}) {
  if (replace) location.replace(url);
  else location.assign(url);
}

export function reload() {
  location.reload();
}
