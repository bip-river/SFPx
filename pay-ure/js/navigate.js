// Page navigation in one place, so the DOM tests can follow a visitor from one site to the other.
// `replace` is used for returns, so the browser's Back button does not reopen a finished payment step.
export function navigate(url, { replace = false } = {}) {
  if (replace) location.replace(url);
  else location.assign(url);
}
