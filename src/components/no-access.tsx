// Shown when someone is signed in to SEED CL but hasn't been given the
// warehouse department. They are a colleague, so say who to ask.
export function NoAccess({ email }: { email: string }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark">SC</div>
        <h1>No access to this dashboard</h1>
        <p>
          You're signed in as <strong>{email}</strong>, but your account isn't on
          the Warehouse team yet.
        </p>
        <p>
          Ask an admin to add <code>warehouse</code> to your departments. Your
          other dashboards still work.
        </p>
        <a className="submit" href="https://seedclmalaysiastore.com">Back to the hub</a>
      </div>
    </div>
  );
}
