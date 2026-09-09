/*
 * ── Client-side validation — shared across all forms ───────────────────────────
 *
 * Pattern used throughout this project:
 *
 *   Each function below validates a single field value.
 *   · Input:  raw string value from the input (trimming is done INSIDE the
 *             validator so callers don't need to pre-trim for the check itself;
 *             they still trim before sending values to the API).
 *   · Return: error message string if invalid, null if valid.
 *
 * How to wire this up in any form (the same 3-step pattern everywhere):
 *
 *   1. Two extra pieces of state alongside the field values:
 *        const [fieldErrors, setFieldErrors] = useState({});
 *        const [touched,     setTouched]     = useState(new Set());
 *
 *   2. A local validate(overrides?) that calls the right validators:
 *        function validate(overrides = {}) {
 *          const e = overrides.email ?? email;   // use override or current state
 *          return { email: validateEmail(e), ... };
 *        }
 *      The overrides parameter handles a React timing subtlety: onBlur fires as
 *      a separate browser event from onChange, so the state update queued by the
 *      last onChange keystroke may not be committed yet. Passing e.target.value
 *      from the blur event as an override ensures we validate the actual current
 *      DOM value, not the possibly-stale state value:
 *        onBlur={(e) => handleBlur('email', e.target.value)}
 *
 *   3. handleBlur(field, value) — validates on leaving a field:
 *        function handleBlur(field, value) {
 *          setTouched(prev => new Set(prev).add(field));
 *          const errors = validate({ [field]: value });
 *          setFieldErrors(prev => ({ ...prev, [field]: errors[field] }));
 *        }
 *
 *   4. handleSubmit / handleSave — validate all fields, block if any error:
 *        const errors = validate();
 *        if (Object.values(errors).some(Boolean)) {
 *          setFieldErrors(errors);
 *          setTouched(new Set(Object.keys(errors)));
 *          return;
 *        }
 *
 *   5. Rendering — show errors only when the field is touched (keeps the form
 *      clean on first load; all errors appear on first failed submit attempt):
 *        {touched.has('email') && fieldErrors.email && (
 *          <span className="field-error">{fieldErrors.email}</span>
 *        )}
 *
 *   6. Backend 400 errors are injected back into fieldErrors when a known error
 *      code maps to a specific field (e.g. VAL_WEAK_PASSWORD → password field).
 *      Unmapped errors surface in the top-of-form error banner instead.
 *
 * To add validation to a new form: import the validators you need, write a
 * local validate() and handleBlur() following the steps above, add noValidate
 * to the <form> element (so browser constraint validation doesn't race with
 * ours), and render errors with the <span className="field-error"> pattern.
 */

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return 'Email is required.';
  // Covers the most common invalid formats; the server is the authoritative check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Must be a valid email address.';
  return null;
}

export function validateName(value) {
  return value.trim() ? null : 'Name is required.';
}

export function validateUsername(value) {
  const v = value.trim();
  if (!v) return 'Username is required.';
  if (v.length < 3) return 'Must be at least 3 characters.';
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) {
    return 'Only letters, numbers, dots, underscores, and hyphens are allowed.';
  }
  return null;
}

export function validatePassword(value) {
  if (!value) return 'Password is required.';
  if (value.length < 8)     return 'Must be at least 8 characters.';
  if (!/[a-z]/.test(value)) return 'Must contain at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Must contain at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Must contain at least one number.';
  return null;
}

// Same strength rules as validatePassword but an empty value is valid — use for
// the optional "set new password" fields in Edit User where blank = no change.
export function validateOptionalPassword(value) {
  if (!value) return null;
  if (value.length < 8)     return 'Must be at least 8 characters.';
  if (!/[a-z]/.test(value)) return 'Must contain at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Must contain at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Must contain at least one number.';
  return null;
}

export function validateRoleSelection(value) {
  return value ? null : 'Please select a role.';
}

// Optional field — only validate format when a value is present.
export function validateMobile(value) {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{10}$/.test(v)) return 'Must be exactly 10 digits.';
  return null;
}

export function validateRoleName(value) {
  const v = value.trim();
  if (!v) return 'Name is required.';
  if (v.length > 100) return 'Name must be 100 characters or less.';
  return null;
}

// Optional field — only validate length when a value is present.
export function validateDescription(value) {
  if (value.trim().length > 500) return 'Description must be 500 characters or less.';
  return null;
}
