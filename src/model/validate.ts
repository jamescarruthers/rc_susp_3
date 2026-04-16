// DOM-level validation for MJCF. Catches syntax errors before we hand the
// XML to mujoco_wasm, whose error reporting is notoriously sparse. This is
// only a parse check — semantic errors (bad joint refs, etc.) still only
// surface when MuJoCo compiles the model.
export function validateMjcf(xml: string): { ok: true } | { ok: false; error: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    return { ok: false, error: err.textContent?.trim() ?? 'XML parse error' };
  }
  if (doc.documentElement.tagName !== 'mujoco') {
    return { ok: false, error: 'Root element must be <mujoco>' };
  }
  return { ok: true };
}
