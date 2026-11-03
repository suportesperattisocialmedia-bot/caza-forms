"use client";

export default function Offline() {
  return (
    <div className="auth">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24 }}>Servidor iniciando</h1>
        <p className="muted">O banco de dados não respondeu a tempo. Aguarde um minuto e recarregue a página.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    </div>
  );
}
