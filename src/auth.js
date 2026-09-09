/*
 * hasPermission reads from localStorage on every call rather than being
 * cached in React state for two reasons:
 *
 * 1. Persistence across refreshes — the user object survives a full page
 *    reload in localStorage. React state resets on every reload, so a
 *    cached copy would be empty until the next login, silently locking
 *    users out of their own pages after a refresh.
 *
 * 2. Synchronous render-time access — permission checks happen during
 *    render (to show/hide buttons, or to decide whether to redirect).
 *    Storing permissions in state would require a useEffect to populate
 *    the state and an extra loading flag to avoid flashing wrong UI
 *    before the effect fires. localStorage reads are synchronous and
 *    need none of that ceremony.
 *
 * Security note: this is UI-only gating. The backend enforces the same
 * permissions on every API request — localStorage can be tampered with
 * client-side, so this code is purely UX (hiding controls the user
 * can't successfully use), not a security boundary.
 */
export function hasPermission(code) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const permissions = user?.role?.permissions ?? [];
    /*
     * Wildcard check — if the user has a permission with code "*", they
     * have unrestricted access and every hasPermission call returns true.
     * This is how super-admin accounts bypass individual permission checks
     * without needing every permission enumerated in their role.
     */
    if (permissions.some((p) => p.code === '*')) return true;
    return permissions.some((p) => p.code === code);
  } catch {
    // Malformed JSON in localStorage — treat as no permissions.
    return false;
  }
}
