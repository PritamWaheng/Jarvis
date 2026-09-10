import { useState } from "react";
import { supabase } from "../lib/supabase";
import "../styles/Login.css";

function Login({ onLogin, initialError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");

    let result;

    if (isSignup) {
      result = await supabase.auth.signUp({
        email,
        password,
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
    }

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (isSignup) {
      setError("Account created. Please check your email if confirmation is required.");
      setLoading(false);
      return;
    }

    onLogin(result.data.session);
  }

  return (
    <div className="login-page">

      <div className="login-card">

        <div className="login-orb">
          J
        </div>

        <h1>JARVIS</h1>

        <p className="login-subtitle">
          PERSONAL AI ASSISTANT
        </p>

        <p className="login-description">
          {isSignup
            ? "Create your JARVIS account"
            : "Welcome back. Authenticate to continue."}
        </p>

        <form onSubmit={handleSubmit}>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Authenticating..."
              : isSignup
                ? "Create Account"
                : "Enter JARVIS"}
          </button>

        </form>

        <button
          className="switch-button"
          onClick={() => {
            setIsSignup(!isSignup);
            setError("");
          }}
        >
          {isSignup
            ? "Already have an account? Sign in"
            : "Create a new account"}
        </button>

      </div>

    </div>
  );
}

export default Login;
