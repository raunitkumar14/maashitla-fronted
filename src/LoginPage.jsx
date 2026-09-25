import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import { validateEmail } from './validation';
import './LoginPage.css';

/*
 * useNavigate is a React Router hook that gives you a function for changing
 * the URL programmatically — without the user clicking a link.
 * We use it here so that after a successful login we can send the user
 * to "/isin-master".
 */

function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // Server-level error (wrong credentials, account locked, etc.)
  const [errorMessage, setErrorMessage] = useState('');

  // Per-field inline errors + blur tracking. See src/validation.js for the pattern.
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched,     setTouched]     = useState(new Set());

  const navigate = useNavigate();

  // Returns the current error for every validated field (null = valid).
  // Accepts overrides so handleBlur can pass the DOM's current value directly,
  // sidestepping the stale-closure issue described in src/validation.js.
  function validate(overrides = {}) {
    const e = overrides.email    ?? email;
    const p = overrides.password ?? password;
    return {
      email:    validateEmail(e),
      password: p.trim() ? null : 'Password is required.',
    };
  }

  function handleBlur(field, value) {
    setTouched(prev => new Set(prev).add(field));
    const errors = validate({ [field]: value });
    setFieldErrors(prev => ({ ...prev, [field]: errors[field] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    // Validate all fields and surface every error before touching the API.
    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setTouched(new Set(['email', 'password']));
      return;
    }

    try {
      const response = await api.post('/admin/v1/auth/login', {
        email:    email.trim(),
        password,
      });

      // Store the token so the axios interceptor can attach it to future requests.
      localStorage.setItem('token', response.data.accessToken);
      // Store user info for display elsewhere in the app.
      localStorage.setItem('user', JSON.stringify(response.data.user));

      navigate('/isin-master');
    } catch (error) {
      // The backend sends { error: { code, message } } on 401 — show that message.
      const message =
        error.response?.data?.error?.message ?? 'Login failed. Please try again.';
      setErrorMessage(message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">

        <div className="login-header">
          <span className="logo-rta">RTA</span>
        </div>

        <div className="login-card">
          {/*
           * noValidate disables the browser's built-in constraint validation
           * (the "Please enter an email address" tooltip) so our custom inline
           * messages are the only validation the user sees.
           */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleBlur('email', e.target.value)}
              />
              {touched.has('email') && fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => handleBlur('password', e.target.value)}
              />
              {touched.has('password') && fieldErrors.password && (
                <span className="field-error">{fieldErrors.password}</span>
              )}
            </div>

            {/* Server-level error (e.g. "Invalid email or password.") */}
            {errorMessage && (
              <p className="login-error">{errorMessage}</p>
            )}

            <button type="submit" className="btn-login">LOGIN</button>
          </form>

          <a href="#" className="forgot-password">Forgot Password?</a>
        </div>

      </div>
    </div>
  );
}

export default LoginPage;
