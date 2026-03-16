import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/anotar", label: "Anotar + CVAT" },
  { to: "/galeria", label: "Galeria + Treino" },
  { to: "/inferir", label: "Inferencia" },
  { to: "/monitoramento", label: "Monitoramento" },
];

export default function Layout() {
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
      <main className="shell__content">
        <Outlet />
      </main>
    </div>
  );
}
