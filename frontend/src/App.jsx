import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AnnotatePage from "./pages/AnnotatePage";
import GalleryPage from "./pages/GalleryPage";
import InferencePage from "./pages/InferencePage";
import MonitoringPage from "./pages/MonitoringPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/anotar" replace />} />
        <Route path="/anotar" element={<AnnotatePage />} />
        <Route path="/galeria" element={<GalleryPage />} />
        <Route path="/inferir" element={<InferencePage />} />
        <Route path="/monitoramento" element={<MonitoringPage />} />
      </Route>
    </Routes>
  );
}
