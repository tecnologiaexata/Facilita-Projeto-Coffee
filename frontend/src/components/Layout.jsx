import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getHealth } from "../lib/api";

const navItems = [
  { to: "/anotar", label: "Anotar + CVAT" },
  { to: "/galeria", label: "Galeria + Treino" },
  { to: "/inferir", label: "Inferencia" },
  { to: "/monitoramento", label: "Monitoramento" },
];

export default function Layout() {
  const [backendStatus, setBackendStatus] = useState({
    available: true,
    checked: false,
    message: "Conectado ao backend.",
  });

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function readBackendHealth() {
      try {
        await getHealth({ retry: { safeToRetry: true, attempts: 1 } });
        if (cancelled) return;
        setBackendStatus({
          available: true,
          checked: true,
          message: "Backend online. Todas as acoes remotas estao liberadas.",
        });
      } catch (error) {
        if (cancelled) return;
        setBackendStatus({
          available: false,
          checked: true,
          message:
            "Backend indisponivel ou reiniciando. O frontend continua online, mas as acoes que dependem da API ficam bloqueadas ate a conexao voltar.",
        });
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(readBackendHealth, 5000);
        }
      }
    }

    readBackendHealth();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return (
    <div className="shell">
      <header className="shell__header shell__header--compact">
        <p className="eyebrow">Facilita Coffee Counter</p>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `nav__link${isActive ? " nav__link--active" : ""}`
              }
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {backendStatus.checked ? (
        <div className={`status shell__status status--${backendStatus.available ? "success" : "error"}`}>
          {backendStatus.message}
        </div>
      ) : null}
      <main className="shell__content">
        <Outlet context={backendStatus} />
      </main>
    </div>
  );
}
